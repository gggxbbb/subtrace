// 任务调度注册表（ADR-0006）：croner 进程内调度 + JobRun 落库 + 启动补跑。
// 注意：instrumentation 与页面/action 在 dev 下是不同模块实例——
// 调度表（Cron 实例）只活在启动实例，而任务定义解析、runJob、listJobs 走静态定义 + DB，
// 在任何实例都可用（用户脚本任务 ticket 03 也从 DB 解析）。

import { Cron } from "croner";
import { prisma } from "../db";
import { refreshAllAutoRates } from "../exchange/service";
import { runReminderScan } from "../reminders";

const KEEP_RUNS = 50;
const MESSAGE_MAX = 2000;

export interface JobDef {
  /** 唯一键：reminders | rates | script:<订阅id> */
  key: string;
  /** cron 表达式（UTC） */
  cron: string;
  /** 大盘显示名 */
  title: string;
  /** 大盘"配置"跳转链接 */
  link: string;
  /** 启动时当日无 OK 记录是否补跑（系统任务 true；脚本 false——快照幂等） */
  catchUp: boolean;
  /** 返回摘要消息（可选）；抛错记 FAIL */
  handler: () => Promise<string | void>;
  /** 失败后 N 分钟重试一次（系统任务用，恢复旧调度器的小时重试语义） */
  retryOnFailureMinutes?: number;
}

const utcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const utcDayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** 系统任务静态定义。 */
function systemJobs(): JobDef[] {
  return [
    {
      key: "reminders",
      cron: "0 0 * * *",
      title: "提醒扫描",
      link: "/settings/channels",
      catchUp: true,
      retryOnFailureMinutes: 60,
      handler: async () => {
        const s = await runReminderScan(utcToday());
        if (s.hits === 0) return "没有即将到期的订阅";
        const parts = [`${s.hits} 条到期提醒`];
        parts.push(s.failed > 0 ? `投递成功 ${s.sent} 条、失败 ${s.failed} 条` : `已全部投递（${s.sent} 条）`);
        return parts.join("，");
      },
    },
    {
      key: "rates",
      cron: "5 0 * * *",
      title: "汇率刷新",
      link: "/settings/rates",
      catchUp: true,
      retryOnFailureMinutes: 60,
      handler: async () => {
        const r = await refreshAllAutoRates();
        if (r.updated === 0 && r.failed.length === 0) return "没有需要自动更新的币对";
        if (r.failed.length === 0) return `已更新 ${r.updated} 个币对`;
        return `更新 ${r.updated} 个，失败 ${r.failed.length} 个（${r.failed.map((f) => f.currency).join("/")}）`;
      },
    },
  ];
}

/** 测试/脚本场景下登记的额外定义（同实例 runJob 可命中）。 */
const extraDefs = new Map<string, JobDef>();

/** 按 key 解析任务定义：系统任务 → 额外登记（测试/同实例）→ DB（ticket 03 脚本）。 */
export async function resolveJob(key: string): Promise<JobDef | null> {
  const sys = systemJobs().find((d) => d.key === key);
  if (sys) return sys;
  const extra = extraDefs.get(key);
  if (extra) return extra;
  if (key.startsWith("script:")) {
    const { resolveScriptJob } = await import("../scripts/job");
    return resolveScriptJob(key);
  }
  return null;
}

/** 执行一个任务并落 JobRun（计时/成败/摘要/裁剪）。调度、手动、外部触发共用。 */
export async function runJob(key: string): Promise<{ ok: boolean; message: string }> {
  const def = await resolveJob(key);
  if (!def) throw new Error(`未注册的任务 job_not_registered: ${key}`);
  const startedAt = new Date();
  let status = "OK";
  let message = "";
  try {
    message = (await def.handler()) ?? "";
  } catch (e) {
    status = "FAIL";
    message = e instanceof Error ? e.message : String(e);
  }
  message = message.slice(0, MESSAGE_MAX);
  await prisma.jobRun.create({
    data: { jobKey: key, startedAt, durationMs: Date.now() - startedAt.getTime(), status, message },
  });
  const stale = await prisma.jobRun.findMany({
    where: { jobKey: key },
    orderBy: { startedAt: "desc" },
    skip: KEEP_RUNS,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.jobRun.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }
  return { ok: status === "OK", message };
}

/** 调度表（仅启动实例）：key → { def, cron }。同 key 重复注册先停旧表。 */
const timers = new Map<string, { def: JobDef; cron: Cron }>();

export function scheduleJob(def: JobDef): void {
  unscheduleJob(def.key);
  extraDefs.set(def.key, def);
  const cron = new Cron(def.cron, { protect: true, timezone: "UTC" }, () => {
    void runJob(def.key).then((r) => {
      if (!r.ok && def.retryOnFailureMinutes) {
        console.warn(`[jobs] ${def.key} 失败，${def.retryOnFailureMinutes} 分钟后重试: ${r.message}`);
        const t = setTimeout(() => void runJob(def.key), def.retryOnFailureMinutes! * 60_000);
        t.unref?.();
      }
    });
  });
  timers.set(def.key, { def, cron });
}

export function unscheduleJob(key: string): void {
  timers.get(key)?.cron.stop();
  timers.delete(key);
  extraDefs.delete(key);
}

let started = false;

/** 启动调度（instrumentation 调用一次）：系统任务起表，catchUp 任务当日无 OK 记录即补跑。 */
export async function startJobScheduler(): Promise<void> {
  if (started) return;
  started = true;
  if (process.env.REMINDER_SCHEDULER === "off") {
    console.log("[jobs] 内置调度已关闭（REMINDER_SCHEDULER=off）");
    return;
  }
  for (const def of systemJobs()) {
    scheduleJob(def);
  }
  for (const def of systemJobs().filter((d) => d.catchUp)) {
    const ran = await prisma.jobRun.findFirst({
      where: { jobKey: def.key, status: "OK", startedAt: { gte: utcDayStart(new Date()) } },
    });
    if (!ran) {
      console.log(`[jobs] 启动补跑: ${def.key}`);
      await runJob(def.key);
    }
  }
  console.log(`[jobs] 调度已启动（${timers.size} 个任务）`);
}

/** 不调度、只算下次触发时间（用一次性实例避免在任意实例里起表）。 */
function peekNextRun(cronExpr: string): Date | null {
  try {
    const c = new Cron(cronExpr, { timezone: "UTC", protect: true }, () => {});
    const next = c.nextRun();
    c.stop();
    return next;
  } catch {
    return null;
  }
}

export interface JobView {
  key: string;
  title: string;
  cron: string;
  link: string;
  nextRun: Date | null;
  lastRun: { startedAt: Date; durationMs: number; status: string; message: string | null } | null;
}

/** 任务大盘数据：系统任务 + DB 中启用的脚本任务 + 各 job 最近一次运行。 */
export async function listJobs(): Promise<JobView[]> {
  const defs: { key: string; title: string; cron: string; link: string }[] = systemJobs().map(
    ({ key, title, cron, link }) => ({ key, title, cron, link }),
  );
  const { listScriptJobMeta } = await import("../scripts/job");
  defs.push(...(await listScriptJobMeta()));

  const views: JobView[] = [];
  for (const def of defs) {
    const lastRun = await prisma.jobRun.findFirst({
      where: { jobKey: def.key },
      orderBy: { startedAt: "desc" },
    });
    views.push({
      ...def,
      nextRun: peekNextRun(def.cron),
      lastRun: lastRun
        ? { startedAt: lastRun.startedAt, durationMs: lastRun.durationMs, status: lastRun.status, message: lastRun.message }
        : null,
    });
  }
  return views.sort((a, b) => a.key.localeCompare(b.key));
}

/** 某 job 的近期运行（大盘/详情用） */
export async function listJobRuns(key: string, limit = 10) {
  return prisma.jobRun.findMany({
    where: { jobKey: key },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
