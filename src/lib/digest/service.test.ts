// 仓储缝测试：摘要服务（ticket 02）。独立测试库 data/test.db，LLM 经 caller 注入假实现，
// 时间经 now 注入；llmConfigured 守门用 vi.stubEnv 模拟 env 三件套。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardData } from "@/lib/dashboard";
import { prisma } from "../db";
import { buildDigestPayload, digestFingerprint } from "./payload";
import { getDigest, type LlmCaller } from "./service";

const t0 = new Date("2026-09-08T10:00:00+08:00");

/** 最小 DashboardData 夹具：buildDigestPayload 读到的信号面各给一条 */
function dashboardFixture(): DashboardData {
  return {
    totalDailyCost: 3.25,
    subDailyCost: 3.0,
    totalMonthlyCost: 97.5,
    monthSpent: 120.5,
    yearSpent: 980.75,
    activeCount: 1,
    rows: [],
    upcoming: [
      { id: "u1", name: "Netflix", date: new Date("2026-09-20T00:00:00+08:00"), daysLeft: 12, amount: 68, auto: true },
    ],
    purchases: [
      { id: "p1", name: "机械键盘", daysHeld: 45, dailyCost: 2.22, progress: 0.6, amountBase: 999, status: "active" },
    ],
    usageBoard: [
      {
        id: "s1",
        name: "ChatGPT Plus",
        windowLabel: "近30天",
        quantityLabel: "消耗 45 GB",
        paid: 99,
        value: 45.5,
        verdictAmount: -53.5,
      },
    ],
    entryRows: [],
    usageById: new Map(),
    itemDailyCost: 0.25,
    trend: [1, 2, 3],
  };
}

const d = dashboardFixture();
const userId = "user-1";
const fingerprint = digestFingerprint(buildDigestPayload(d), userId);

/** 计数假 caller：返回固定文案，可配置为抛错 */
function fakeCaller(behavior: { line?: string; detail?: string; error?: Error } = {}) {
  const calls: unknown[] = [];
  const caller: LlmCaller = async (payload) => {
    calls.push(payload);
    if (behavior.error) throw behavior.error;
    return { line: behavior.line ?? "本月支出 120.5 元，Netflix 12 天后到期。", detail: "详细版\n- 支出口径" };
  };
  return { caller, calls };
}

beforeEach(async () => {
  vi.stubEnv("LLM_BASE_URL", "http://llm.local/v1");
  vi.stubEnv("LLM_API_KEY", "k");
  vi.stubEnv("LLM_MODEL", "m");
  await prisma.digestCache.deleteMany();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDigest 缓存命中", () => {
  it("指纹命中且 failed=false → 返回缓存文案，不调 caller", async () => {
    await prisma.digestCache.create({
      data: { fingerprint, userId, line: "缓存单行", detail: "缓存详细", failed: false },
    });
    const { caller, calls } = fakeCaller();
    const result = await getDigest(d, userId, { caller, now: t0 });
    expect(result).toEqual({ kind: "digest", line: "缓存单行", detail: "缓存详细" });
    expect(calls).toHaveLength(0);
  });
});

describe("getDigest miss 生成", () => {
  it("miss → 调 caller、单行版/详细版双格式落库并返回", async () => {
    const { caller, calls } = fakeCaller();
    const result = await getDigest(d, userId, { caller, now: t0 });
    expect(result).toEqual({
      kind: "digest",
      line: "本月支出 120.5 元，Netflix 12 天后到期。",
      detail: "详细版\n- 支出口径",
    });
    expect(calls).toHaveLength(1);
    const row = await prisma.digestCache.findUnique({ where: { fingerprint } });
    expect(row).toMatchObject({
      userId,
      line: "本月支出 120.5 元，Netflix 12 天后到期。",
      detail: "详细版\n- 支出口径",
      failed: false,
    });
  });

  it("caller 返回 line 超 80 字 → 落库与返回均为截断后 ≤80 字", async () => {
    const long = "很".repeat(100);
    const { caller } = fakeCaller({ line: long });
    const result = await getDigest(d, userId, { caller, now: t0 });
    if (result.kind !== "digest") throw new Error("应为 digest");
    expect([...result.line].length).toBe(80);
    const row = await prisma.digestCache.findUnique({ where: { fingerprint } });
    expect([...row!.line].length).toBe(80);
    expect(row!.line).toBe(result.line);
  });

  it("并发两个同指纹 getDigest → caller 只调一次（单飞）", async () => {
    // 闸门 caller：进入即发信号、闸门打开放行——确定性制造「第二次调用到达时第一次仍在途」
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const calls: unknown[] = [];
    const caller: LlmCaller = async (payload) => {
      calls.push(payload);
      entered.resolve();
      await gate.promise;
      return { line: "并发单行", detail: "并发详细" };
    };
    const p1 = getDigest(d, userId, { caller, now: t0 });
    const p2 = getDigest(d, userId, { caller, now: t0 });
    await entered.promise; // 第一次调用已进入 caller 且在途
    gate.resolve();
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(a.kind).toBe("digest");
  });
});

describe("getDigest 负缓存", () => {
  it("caller 抛错 → fallback + failed=true 落库；30 分钟内不重调，31 分钟放行重试", async () => {
    const { caller, calls } = fakeCaller({ error: new Error("boom") });

    const first = await getDigest(d, userId, { caller, now: t0 });
    expect(first).toEqual({ kind: "fallback" });
    expect(calls).toHaveLength(1);
    const row = await prisma.digestCache.findUnique({ where: { fingerprint } });
    expect(row!.failed).toBe(true);

    // 29 分钟后：负缓存 TTL 内 → fallback 且不重复调 caller
    const within = await getDigest(d, userId, {
      caller,
      now: new Date(t0.getTime() + 29 * 60_000),
    });
    expect(within).toEqual({ kind: "fallback" });
    expect(calls).toHaveLength(1);

    // 31 分钟后：负缓存过期 → 放行重试；本次 caller 成功则覆盖为成功条目
    const recovered = fakeCaller();
    const after = await getDigest(d, userId, {
      caller: recovered.caller,
      now: new Date(t0.getTime() + 31 * 60_000),
    });
    expect(recovered.calls).toHaveLength(1);
    expect(after.kind).toBe("digest");
    const fresh = await prisma.digestCache.findUnique({ where: { fingerprint } });
    expect(fresh!.failed).toBe(false);
  });
});

describe("getDigest 未配置", () => {
  it("env 三件套缺失 → fallback 且不调 caller、不落库", async () => {
    vi.unstubAllEnvs();
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    const { caller, calls } = fakeCaller();
    const result = await getDigest(d, userId, { caller, now: t0 });
    expect(result).toEqual({ kind: "fallback" });
    expect(calls).toHaveLength(0);
    expect(await prisma.digestCache.count()).toBe(0);
  });
});
