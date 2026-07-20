import { redirect } from "next/navigation";
import { Panel } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { listScriptSubs } from "@/lib/scripts/service";
import { scriptJobKey } from "@/lib/scripts/job";
import { ScriptEditor, type ScriptLastRun } from "./ScriptEditor";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { sub, error } = await searchParams;
  const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const subs = me.canUseScripts ? await listScriptSubs(user.id) : [];

  const lastRuns: Record<string, ScriptLastRun | null> = {};
  for (const s of subs) {
    const run = await prisma.jobRun.findFirst({
      where: { jobKey: scriptJobKey(s.id) },
      orderBy: { startedAt: "desc" },
    });
    lastRuns[s.id] = run
      ? { status: run.status, startedAt: fmtDateTime(run.startedAt), message: run.message }
      : null;
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            settings / scripts
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">用量脚本</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {error && (
            <div className="border border-black bg-[#FF5A00] px-3 py-1.5 text-[10px] uppercase text-white f-mono">
              保存失败：{error}
            </div>
          )}
          {!me.canUseScripts ? (
            <Panel index="01" title="未开放">
              <div className="px-4 py-8 text-center text-[11px] leading-relaxed text-neutral-500">
                脚本功能在沙箱中执行用户代码，仅对管理员标记的信任用户开放。
                <br />
                请联系管理员在「用户管理」中为你的账号开启。
              </div>
            </Panel>
          ) : subs.length === 0 ? (
            <Panel index="01" title="无可选订阅">
              <div className="px-4 py-8 text-center text-[11px] leading-relaxed text-neutral-500">
                还没有额度型订阅。脚本只能挂在额度型订阅上（机场流量、网盘容量等），
                请先在订阅详情把用量类型设为「额度型」。
              </div>
            </Panel>
          ) : (
            <Panel index="01" title={`脚本 / ${subs.filter((s) => s.script).length} 已启用`}>
              <div className="p-4">
                <ScriptEditor subs={subs} lastRuns={lastRuns} selectedId={sub ?? null} />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
