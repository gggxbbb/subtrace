import Link from "next/link";
import { Plus } from "lucide-react";
import { Panel, fmt, fmtDate } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { listBundles } from "@/lib/bundles/service";

export default async function BundlesPage() {
  const user = (await getCurrentUser())!;
  const bundles = await listBundles(user.id);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            04 / bundles
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">联合会员</h1>
        </div>
        <Link
          href="/bundles/new"
          className="flex items-center gap-1.5 bg-black px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 新建联合会员
        </Link>
      </header>

      <div className="space-y-4 px-6 py-5">
        {bundles.length === 0 && (
          <Panel index="01" title="联合会员 / 0">
            <div className="px-4 py-8 text-center text-[11px] uppercase text-neutral-400 f-mono">
              还没有联合会员，点右上角「新建联合会员」开始
            </div>
          </Panel>
        )}
        {bundles.map((b, idx) => (
          <Panel
            key={b.id}
            index={String(idx + 1).padStart(2, "0")}
            title={`${b.name} · ${fmt(b.totalAmountBase)} · ${fmtDate(b.periodStart)} → ${fmtDate(b.periodEnd)}`}
          >
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-black text-left text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
                  <th className="px-4 py-2 font-medium">子会员</th>
                  <th className="px-4 py-2 text-right font-medium">分摊金额</th>
                  <th className="px-4 py-2 font-medium">服务区间</th>
                </tr>
              </thead>
              <tbody>
                {b.payments.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-200 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/subscriptions/${p.subscriptionId}`} className="font-medium hover:underline">
                        {p.subscription.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums f-mono text-[11px]">{fmt(p.amountBase)}</td>
                    <td className="px-4 py-2.5 text-[11px] tabular-nums text-neutral-500 f-mono">
                      {fmtDate(p.periodStart)} → {fmtDate(p.periodEnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
    </>
  );
}
