import Link from "next/link";
import { Plus } from "lucide-react";
import { Led, Panel, fmt, fmtDate } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard";
import { listArchivedSubscriptions } from "@/lib/subscriptions/service";
import { ArchivedList } from "./ArchivedList";

export default async function SubscriptionsPage() {
  const user = (await getCurrentUser())!;
  const d = await getDashboardData(user.id);
  const archived = await listArchivedSubscriptions(user.id);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            02 / subscriptions
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">订阅</h1>
        </div>
        <Link
          href="/subscriptions/new"
          className="flex items-center gap-1.5 bg-black px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 新建订阅
        </Link>
      </header>

      <div className="px-6 py-5">
        <Panel index="01" title={`全部订阅 / ${d.rows.length}`}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-black text-left text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">分类</th>
                <th className="px-4 py-2 font-medium">周期</th>
                <th className="px-4 py-2 font-medium">到期日</th>
                <th className="px-4 py-2 text-right font-medium">日均</th>
                <th className="px-4 py-2 text-right font-medium">月均</th>
                <th className="px-4 py-2 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((s) => (
                <tr key={s.id} className="border-b border-neutral-200 last:border-0 hover:bg-black/[0.03]">
                  <td className="px-4 py-2.5">
                    <Link href={`/subscriptions/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500">{s.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[11px] text-neutral-500 f-mono">{s.cycleLabel}</td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-neutral-500 f-mono">
                    {s.expiry ? fmtDate(s.expiry) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11px] font-semibold tabular-nums f-mono">{fmt(s.dailyCost)}</td>
                  <td className="px-4 py-2.5 text-right text-[11px] tabular-nums text-neutral-500 f-mono">{fmt(s.monthlyCost)}</td>
                  <td className="px-4 py-2.5">
                    {s.status === "CANCELLED" ? (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono">
                        <Led color="#ef4444" /> 已取消
                      </span>
                    ) : s.daysUntilExpiry !== null && s.daysUntilExpiry <= 14 ? (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase text-white f-mono" style={{ background: "#FF5A00" }}>
                        <Led color="#fff" /> {s.daysUntilExpiry}d
                      </span>
                    ) : (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono">
                        <Led color="#22c55e" /> ok
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {d.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[11px] uppercase text-neutral-400 f-mono">
                    还没有订阅，点右上角「新建订阅」开始
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        <div className="mt-4">
          <Panel index="02" title={`已归档 / ${archived.length}`}>
            <ArchivedList
              rows={archived.map((a) => ({
                id: a.id,
                name: a.name,
                category: a.category,
                startDate: a.startDate.toISOString().slice(0, 10),
              }))}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
