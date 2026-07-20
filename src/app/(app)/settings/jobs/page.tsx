import { redirect } from "next/navigation";
import { Panel } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { listJobs } from "@/lib/jobs";
import { JobsTable } from "./JobsTable";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const jobs = await listJobs();
  const iso = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            settings / jobs
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">定时任务</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <p className="mb-4 max-w-3xl text-[10px] uppercase leading-relaxed tracking-wider text-neutral-500 f-mono">
          进程内 cron 调度（ADR-0006）：系统任务每日 UTC 运行、启动时补跑当日；每次运行落记录（留最近 50 条）。
          「立即运行」用于调试——提醒投递有唯一键去重、汇率是覆盖式快照，重复触发安全。
        </p>
        <Panel index="01" title={`任务 / ${jobs.length}`}>
          <JobsTable
            jobs={jobs.map((j) => ({
              ...j,
              nextRun: j.nextRun ? iso(j.nextRun) : null,
              lastRun: j.lastRun ? { ...j.lastRun, startedAt: iso(j.lastRun.startedAt) } : null,
            }))}
          />
        </Panel>
      </div>
    </>
  );
}
