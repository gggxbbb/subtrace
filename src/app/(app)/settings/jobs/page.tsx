import { redirect } from "next/navigation";
import { Panel } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/dates";
import { listJobs } from "@/lib/jobs";
import { JobsTable } from "./JobsTable";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const jobs = await listJobs();


  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink bg-base px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            settings / jobs
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">定时任务</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <p className="mb-4 max-w-3xl text-[10px] uppercase leading-relaxed tracking-wider text-neutral-500 f-mono">
          系统内置的每日任务（检查到期提醒、更新汇率），服务器重启当天会自动补跑。
          「立即运行」用于调试，重复点击不会造成重复提醒或错误数据。
        </p>
        <Panel index="01" title={`任务 / ${jobs.length}`}>
          <JobsTable
            jobs={jobs.map((j) => ({
              ...j,
              nextRun: j.nextRun ? fmtDateTime(j.nextRun) : null,
              lastRun: j.lastRun ? { ...j.lastRun, startedAt: fmtDateTime(j.lastRun.startedAt) } : null,
            }))}
          />
        </Panel>
      </div>
    </>
  );
}
