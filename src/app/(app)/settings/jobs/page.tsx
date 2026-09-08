import { redirect } from "next/navigation";
import { Panel } from "@/components/te";
import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader
        crumb={<>settings / jobs</>}
        title={<>定时任务</>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        <p className="mb-4 max-w-3xl text-[10px] uppercase leading-relaxed tracking-wider text-muted f-mono">
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
