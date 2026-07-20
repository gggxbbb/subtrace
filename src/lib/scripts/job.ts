// 脚本任务解析与执行（ticket 03，ADR-0006/0007）：
// script:<订阅id> → 任务定义；产出写 UsageRecord（QUOTA 的 TOTAL 快照）。

import { Cron } from "croner";
import { prisma } from "../db";
import type { JobDef } from "../jobs";
import { runScript } from "./sandbox";

/** 脚本 cron 的时区约定：北京时间（家庭自用场景，ADR-0006） */
export const SCRIPT_TZ = "Asia/Shanghai";

export const scriptJobKey = (subscriptionId: string) => `script:${subscriptionId}`;

import { today } from "../dates";

/** 执行单个订阅的脚本：沙箱运行 → 写 TOTAL 快照。返回摘要消息；失败抛错（runJob 记 FAIL）。 */
export async function executeScriptJob(subscriptionId: string): Promise<string> {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub?.script) throw new Error("订阅不存在或未启用脚本");
  let env: Record<string, unknown> = {};
  try {
    env = sub.scriptEnv ? (JSON.parse(sub.scriptEnv) as Record<string, unknown>) : {};
  } catch {
    throw new Error("脚本 env 配置损坏（非 JSON）");
  }
  const result = await runScript(sub.script, { env });
  if (!result.ok) {
    const tail = result.logs.length > 0 ? `\n日志: ${result.logs.join("\n")}` : "";
    throw new Error(`${result.error}${tail}`.slice(0, 1500));
  }
  await prisma.usageRecord.create({
    data: {
      subscriptionId: sub.id,
      userId: sub.ownerId,
      date: today(),
      quantity: result.used,
      kind: "TOTAL",
      source: "SCRIPT",
      ...(result.total !== undefined ? { quotaTotal: result.total } : {}),
    },
  });
  const logTail = result.logs.length > 0 ? `；日志 ${result.logs.length} 行` : "";
  return `已写入快照：已用 ${result.used}${result.total !== undefined ? ` / 总额 ${result.total}` : ""}${logTail}`;
}

/** script:<订阅id> → 任务定义；未启用/不存在为 null。 */
export async function resolveScriptJob(key: string): Promise<JobDef | null> {
  const subscriptionId = key.slice("script:".length);
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub?.script || !sub.scriptCron) return null;
  return {
    key,
    cron: sub.scriptCron,
    title: `用量脚本 · ${sub.name}`,
    link: `/subscriptions/${sub.id}`,
    catchUp: false,
    tz: SCRIPT_TZ,
    handler: () => executeScriptJob(sub.id),
  };
}

/** 大盘用的脚本任务元数据。 */
export async function listScriptJobMeta(): Promise<{ key: string; title: string; cron: string; link: string; tz?: string }[]> {
  const subs = await prisma.subscription.findMany({
    where: { script: { not: null }, scriptCron: { not: null } },
    select: { id: true, name: true, scriptCron: true },
  });
  return subs.map((s) => ({
    key: scriptJobKey(s.id),
    title: `用量脚本 · ${s.name}`,
    cron: s.scriptCron!,
    link: `/subscriptions/${s.id}`,
    tz: SCRIPT_TZ,
  }));
}

/** cron 表达式合法性校验（保存脚本时用，croner 构造即解析）。 */
export function isValidCron(expr: string): boolean {
  try {
    const c = new Cron(expr);
    c.stop();
    return true;
  } catch {
    return false;
  }
}

/** DB 中启用脚本的订阅 → 任务定义（启动加载 / 定时对账用）。 */
export async function loadScriptJobs(): Promise<JobDef[]> {
  const subs = await prisma.subscription.findMany({
    where: { script: { not: null }, scriptCron: { not: null } },
    select: { id: true, name: true, scriptCron: true },
  });
  return subs.map((s) => ({
    key: scriptJobKey(s.id),
    cron: s.scriptCron!,
    title: `用量脚本 · ${s.name}`,
    link: `/subscriptions/${s.id}`,
    catchUp: false,
    tz: SCRIPT_TZ,
    handler: () => executeScriptJob(s.id),
  }));
}
