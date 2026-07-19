// 内置每日提醒调度（ticket 08 补充）：自部署单实例场景免去外部 cron。
// 每小时检查一次「今天是否已扫」，服务器重启时首检即补跑当日扫描；
// ReminderDelivery 唯一键保证幂等——与外部 cron 重复触发无害。
// 设 REMINDER_SCHEDULER=off 可关闭（多实例部署时只留一个实例开）。

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let lastScanDay = ""; // UTC 日期串，内存态即可：重启后为空 → 立即补扫
let running = false;

const utcDay = () => new Date().toISOString().slice(0, 10);

async function scanIfNeeded() {
  if (running || lastScanDay === utcDay()) return;
  running = true;
  try {
    const { runReminderScan } = await import("@/lib/reminders");
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const summary = await runReminderScan(today);
    lastScanDay = utcDay();
    if (summary.hits > 0 || summary.failed > 0) {
      console.log(`[reminders] 扫描完成: hits=${summary.hits} sent=${summary.sent} failed=${summary.failed}`);
    }
  } catch (e) {
    // 失败不记 lastScanDay，下小时重试
    console.error("[reminders] 扫描失败:", e);
  } finally {
    running = false;
  }
}

export function startReminderScheduler() {
  if (timer || process.env.REMINDER_SCHEDULER === "off") return;
  void scanIfNeeded(); // 启动即检（含重启补跑）
  timer = setInterval(() => void scanIfNeeded(), CHECK_INTERVAL_MS);
  timer.unref?.();
  console.log("[reminders] 内置调度已启动（每小时检查，UTC 日切换后扫描）");
}
