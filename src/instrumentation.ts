// Next 服务器启动钩子：拉起内置提醒调度（仅 nodejs runtime）。

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReminderScheduler } = await import("@/lib/reminders-scheduler");
    startReminderScheduler();
  }
}
