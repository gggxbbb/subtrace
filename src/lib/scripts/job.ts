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
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { owner: { select: { canUseScripts: true } } },
  });
  if (!sub?.script) throw new Error("订阅不存在或未启用脚本");
  // 信任标记是真实防线（ADR-0007）：撤销后调度路径同样拒绝
  if (!sub.owner.canUseScripts) throw new Error("脚本权限已被撤销 scripts_forbidden");
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
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { owner: { select: { canUseScripts: true } } },
  });
  if (!sub?.script || !sub.scriptCron || !sub.owner.canUseScripts) return null;
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
    where: { script: { not: null }, scriptCron: { not: null }, owner: { canUseScripts: true } },
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

/** 外部 cron 触发（内置调度关闭时的高频逃生门）：运行最近 N 分钟内到点的脚本。 */
export async function runDueScriptsSince(minutes: number): Promise<{ ran: number; skipped: number; errors: string[] }> {
  const subs = await prisma.subscription.findMany({
    where: { script: { not: null }, scriptCron: { not: null } },
    select: { id: true, name: true, scriptCron: true },
  });
  const since = new Date(Date.now() - minutes * 60_000);
  const result = { ran: 0, skipped: 0, errors: [] as string[] };
  for (const sub of subs) {
    try {
      const cron = new Cron(sub.scriptCron!, { timezone: SCRIPT_TZ });
      const due = cron.nextRuns(1, since).filter((d) => d <= new Date());
      cron.stop();
      if (due.length === 0) {
        result.skipped += 1;
        continue;
      }
      const key = scriptJobKey(sub.id);
      const lastRun = await prisma.jobRun.findFirst({ where: { jobKey: key }, orderBy: { startedAt: "desc" } });
      if (lastRun && lastRun.startedAt >= due[due.length - 1]) {
        result.skipped += 1;
        continue;
      }
      const { runJob } = await import("../jobs");
      const r = await runJob(key);
      result.ran += 1;
      if (!r.ok) result.errors.push(`${sub.name}: ${r.message.split("\n")[0]}`);
    } catch (e) {
      result.errors.push(`${sub.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
