import Link from "next/link";
import { isoDay } from "@/lib/dates";
import { Plus } from "lucide-react";
import { Panel, ORANGE, fmt, fmtDate } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { breakevenProgress, dayDiff, purchaseCurrentDailyRate } from "@/lib/cost-engine";
import { listArchivedPurchases, listPurchases, toEnginePurchase } from "@/lib/purchases/service";
import { ArchivedPurchaseList } from "./ArchivedPurchaseList";

export default async function PurchasesPage() {
  const user = (await getCurrentUser())!;
  const purchases = await listPurchases(user.id);
  const archived = await listArchivedPurchases(user.id);
  const today = new Date();
  const rows = purchases.map((p) => {
    const engine = toEnginePurchase(p);
    return {
      ...p,
      daysHeld: dayDiff(p.purchaseDate, today),
      dailyCost: purchaseCurrentDailyRate(engine, today),
      progress: breakevenProgress(engine, today),
    };
  });

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            03 / purchases
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">物品</h1>
        </div>
        <Link
          href="/purchases/new"
          className="flex items-center gap-1.5 bg-black px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 登记物品
        </Link>
      </header>

      <div className="px-6 py-5">
        <Panel index="01" title={`全部物品 / ${rows.length}`}>
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-[11px] uppercase text-neutral-400 f-mono">
              还没有物品，点右上角「登记物品」开始
            </div>
          )}
          <div className="grid grid-cols-3 gap-px bg-white">
            {rows.map((p) => (
              <Link key={p.id} href={`/purchases/${p.id}`} className="block border border-neutral-200 bg-white px-4 py-3 hover:bg-black/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium" title={p.name}>{p.name}</span>
                  <span className="shrink-0 text-[9px] uppercase text-neutral-400 f-mono">
                    {p.status === "IN_USE" ? `${p.daysHeld}d held` : p.status === "SOLD" ? "已卖出" : "已报废"}
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 w-full bg-[#E4E3E0]">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.round((p.progress ?? Math.min(1, p.daysHeld / 1095)) * 100)}%`,
                      background: p.status === "IN_USE" ? ORANGE : "#999",
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[9px] text-neutral-500 f-mono">
                  <span>{p.status === "IN_USE" ? `${fmt(p.dailyCost)}/day` : "—"}</span>
                  <span>{fmt(p.amountBase)}</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <div className="mt-4">
          <Panel index="02" title={`已归档 / ${archived.length}`}>
            <ArchivedPurchaseList
              rows={archived.map((a) => ({
                id: a.id,
                name: a.name,
                category: a.category,
                status: a.status,
                purchaseDate: isoDay(a.purchaseDate),
              }))}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
