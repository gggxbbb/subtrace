// 摘要服务（ADR-0016）：指纹缓存直读 → miss 调 LLM 落库 → 失败负缓存（30 分钟 TTL）。
// 并发 miss 进程内按指纹单飞（单实例部署，ADR-0005），跨进程靠 fingerprint 主键 upsert 兜底。

import type { DashboardData } from "@/lib/dashboard";
import { prisma } from "../db";
import { defaultCaller, llmConfigured, type LlmCaller } from "./llm";
import { buildDigestPayload, digestFingerprint, type DigestPayload } from "./payload";

export type { LlmCaller };

export type DigestResult =
  | { kind: "digest"; line: string; detail: string }
  | { kind: "fallback" };

/** 负缓存 TTL：失败条目 30 分钟内不重试，防故障刷屏 */
const NEGATIVE_TTL_MS = 30 * 60 * 1000;
/** 单行版上限：banner 单行展示，LLM 超长篇服务端截断兜底 */
const LINE_MAX = 80;

async function generate(
  payload: DigestPayload,
  fingerprint: string,
  userId: string,
  caller: LlmCaller,
  now: Date,
): Promise<DigestResult> {
  try {
    const { line, detail } = await caller(payload);
    // 按码点截断，不切半 surrogate pair
    const safeLine = [...line].slice(0, LINE_MAX).join("");
    await prisma.digestCache.upsert({
      where: { fingerprint },
      create: { fingerprint, userId, line: safeLine, detail, failed: false, createdAt: now },
      update: { userId, line: safeLine, detail, failed: false, createdAt: now },
    });
    return { kind: "digest", line: safeLine, detail };
  } catch {
    // 负缓存：刷新 createdAt（以 now 为 TTL 基准，测试可注入）
    await prisma.digestCache.upsert({
      where: { fingerprint },
      create: { fingerprint, userId, line: "", detail: "", failed: true, createdAt: now },
      update: { userId, line: "", detail: "", failed: true, createdAt: now },
    });
    return { kind: "fallback" };
  }
}

export async function getDigest(
  d: DashboardData,
  userId: string,
  opts?: { caller?: LlmCaller; now?: Date },
): Promise<DigestResult> {
  // 配置即开启：env 三件套不齐，功能不存在
  if (!llmConfigured()) return { kind: "fallback" };
  const caller = opts?.caller ?? defaultCaller;
  const now = opts?.now ?? new Date();

  const payload = buildDigestPayload(d);
  const fingerprint = digestFingerprint(payload, userId);

  const cached = await prisma.digestCache.findUnique({ where: { fingerprint } });
  if (cached) {
    if (!cached.failed) return { kind: "digest", line: cached.line, detail: cached.detail };
    if (now.getTime() - cached.createdAt.getTime() < NEGATIVE_TTL_MS) {
      return { kind: "fallback" };
    }
    // 负缓存过期：放行重试（落回下面生成路径，upsert 覆盖）
  }

  // 进程内单飞：同指纹在途调用直接复用同一 Promise
  const pending = inflight.get(fingerprint);
  if (pending) return pending;
  const promise = generate(payload, fingerprint, userId, caller, now).finally(() =>
    inflight.delete(fingerprint),
  );
  inflight.set(fingerprint, promise);
  return promise;
}

const inflight = new Map<string, Promise<DigestResult>>();
