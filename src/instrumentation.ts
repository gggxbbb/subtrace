// Next 服务器启动钩子：拉起任务调度注册表（ADR-0006，仅 nodejs runtime）。

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobScheduler } = await import("@/lib/jobs");
    await startJobScheduler();
  }
}
