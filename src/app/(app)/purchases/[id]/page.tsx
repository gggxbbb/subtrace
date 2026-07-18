import { notFound } from "next/navigation";
import { Kpi, Panel, fmt, fmtDate } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import {
  breakevenProgress,
  dayDiff,
  purchaseCurrentDailyRate,
  purchaseDailyRate,
} from "@/lib/cost-engine";
import { getPurchase, toEnginePurchase } from "@/lib/purchases/service";
import { closePurchaseAction } from "@/lib/purchases/actions";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = (await getCurrentUser())!;
  const purchase = await getPurchase(user.id, id);
  if (!purchase) notFound();

  const today = new Date();
  const engine = toEnginePurchase(purchase);
  const inUse = purchase.status === "IN_USE";
  const daily = purchaseDailyRate(engine, today);
  const progress = breakevenProgress(engine, today);
  const todayIso = today.toISOString().slice(0, 10);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            purchases / {purchase.category ?? "uncategorized"}
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">{purchase.name}</h1>
        </div>
      </header>

      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-4 gap-4">
          <Kpi index="C1" label="买入价" value={fmt(purchase.amountBase)} sub={`购于 ${fmtDate(purchase.purchaseDate)}`} />
          <Kpi index="C2" label="持有天数" value={`${dayDiff(purchase.purchaseDate, today)}`} sub={purchase.expectedDays ? `预期寿命 ${purchase.expectedDays} 天` : "未定寿命"} />
          <Kpi
            index="C3"
            label="当前费率"
            value={inUse ? fmt(purchaseCurrentDailyRate(engine, today)) : "—"}
            sub={inUse ? "回本模型摊销" : purchase.status === "SOLD" ? "已卖出" : "已报废"}
          />
          <Kpi
            index="C4"
            label="回本进度"
            value={progress != null ? `${Math.round(progress * 100)}%` : "—"}
            sub={purchase.resaleBase != null ? `残值 ${fmt(purchase.resaleBase)}` : "无残值"}
          />
        </div>

        {inUse && (
          <div className="grid grid-cols-2 gap-4">
            <Panel index="01" title="卖出登记">
              <form action={closePurchaseAction.bind(null, purchase.id)} className="space-y-4 px-4 py-4">
                <input type="hidden" name="status" value="SOLD" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">卖出日期</label>
                    <input name="endDate" type="date" defaultValue={todayIso} required className="w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white f-mono" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">残值（主币种）</label>
                    <input name="resaleBase" type="number" step="0.01" min="0" required className="w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white" />
                  </div>
                </div>
                <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
                  确认卖出 →
                </button>
              </form>
            </Panel>
            <Panel index="02" title="报废登记">
              <form action={closePurchaseAction.bind(null, purchase.id)} className="space-y-4 px-4 py-4">
                <input type="hidden" name="status" value="RETIRED" />
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">报废日期</label>
                  <input name="endDate" type="date" defaultValue={todayIso} required className="w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white f-mono" />
                </div>
                <button className="w-full border border-black bg-white py-2.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-black hover:text-white">
                  确认报废（无残值） →
                </button>
              </form>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
