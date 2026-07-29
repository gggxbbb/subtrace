import { notFound } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { Kpi, Panel } from "@/components/te";
import { fmtMoney } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth/session";
import {
  breakevenProgress,
  dayDiff,
  purchaseCurrentDailyRate,
  purchaseDailyRate,
  purchaseNet,
} from "@/lib/cost-engine";
import { EVENT_KIND_LABEL } from "@/lib/purchases/kinds";
import { getPurchase, listPurchaseEvents, listPurchaseIncomes, subscriptionShareCost, toEnginePurchase } from "@/lib/purchases/service";
import { closePurchaseAction } from "@/lib/purchases/actions";
import { PurchaseHeaderActions, PurchaseIncomePanel } from "./PurchasePanels";
import { PurchaseEventsPanel } from "./PurchaseEventsPanel";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = (await getCurrentUser())!;
  const cur = user.baseCurrency;
  const purchase = await getPurchase(user.id, id);
  if (!purchase) notFound();

  const today = new Date();
  const engine = toEnginePurchase(purchase);
  const inUse = purchase.status === "IN_USE";
  const daily = purchaseDailyRate(engine, today);
  const progress = breakevenProgress(engine, today);
  const todayIso = isoDay(today);
  // TCO（ADR-0003）：物品净额 + 订阅份额 − 累计收益
  const shareLines = await subscriptionShareCost(user.id, purchase, today);
  const subShareTotal = shareLines.reduce((s, l) => l.amount, 0);
  const incomes = await listPurchaseIncomes(purchase.id);
  const incomeTotal = incomes.reduce((s, i) => s + i.amountBase, 0);
  const events = await listPurchaseEvents(purchase.id);
  const itemNet = purchaseNet(engine);
  const tco = itemNet + subShareTotal - incomeTotal;

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            purchases / {purchase.category ?? "uncategorized"}
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">{purchase.name}</h1>
        </div>
        <PurchaseHeaderActions purchaseId={purchase.id} archived={purchase.archived} />
      </header>

      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Kpi index="C1" label="买入价" value={fmtMoney(purchase.amountBase, cur)} sub={`购于 ${isoDay(purchase.purchaseDate)}`} />
          <Kpi index="C2" label="持有天数" value={`${dayDiff(purchase.purchaseDate, today)}`} sub={
            purchase.expectedDays
              ? `预期寿命 ${purchase.expectedDays + (engine.extraDays ?? 0)} 天${engine.extraDays ? `（含延长 +${engine.extraDays}d）` : ""}`
              : "未定寿命"
          } />
          <Kpi
            index="C3"
            label="当前费率"
            value={inUse ? fmtMoney(purchaseCurrentDailyRate(engine, today), cur) : "—"}
            sub={inUse ? "回本模型摊销" : purchase.status === "SOLD" ? "已卖出" : "已报废"}
          />
          <Kpi
            index="C4"
            label="回本进度"
            value={progress != null ? `${Math.round(progress * 100)}%` : "—"}
            sub={purchase.resaleBase != null ? `残值 ${fmtMoney(purchase.resaleBase, cur)}` : "无残值"}
          />
        </div>

        <div className="border border-black bg-white">
          <div className="flex items-center justify-between border-b border-black bg-[#E4E3E0] px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 f-mono">
              TCO · 总持有成本
            </span>
            <span className="text-lg font-bold tabular-nums">{fmtMoney(tco, cur)}</span>
          </div>
          <div className="px-4 py-3 text-[12px]">
            <div className="flex justify-between border-b border-dashed border-neutral-200 py-1">
              <span className="text-neutral-500">
                物品净额（买入{events.length > 0 ? ` + 追加 ${events.length} 笔` : ""} − 残值）
              </span>
              <span className="tabular-nums f-mono">{fmtMoney(itemNet, cur)}</span>
            </div>
            {shareLines.map((l) => (
              <div key={l.subscriptionId} className="flex justify-between border-b border-dashed border-neutral-200 py-1">
                <span className="text-neutral-500">
                  <a href={`/subscriptions/${l.subscriptionId}`} className="underline decoration-dotted hover:text-black">{l.name}</a>
                  <span className="ml-1 text-[10px] text-neutral-400 f-mono">
                    份额 {Math.round(l.share * 100)}% · {l.expiry ? `到期 ${isoDay(l.expiry)}` : "—"} · {fmtMoney(l.dailyRateShare, cur)}/日
                  </span>
                </span>
                <span className="tabular-nums f-mono">{fmtMoney(l.amount, cur)}</span>
              </div>
            ))}
            {incomeTotal > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-neutral-500">累计收益（{incomes.length} 笔）</span>
                <span className="tabular-nums text-teal-700 f-mono">−{fmtMoney(incomeTotal, cur)}</span>
              </div>
            )}
            {shareLines.length === 0 && (
              <div className="py-1 text-[11px] text-neutral-400">无订阅份额——可在订阅详情页把本物品加为受益实体</div>
            )}
          </div>
          <div className="border-t border-dashed border-neutral-300 px-4 py-2.5 text-[10px] text-neutral-500 f-mono">
            时间线：{isoDay(purchase.purchaseDate)} 买入
            {events.map((e) => ` → ${isoDay(e.date)} ${EVENT_KIND_LABEL[e.kind] ?? "费用"}`).join("")}
            {purchase.endDate ? ` → ${isoDay(purchase.endDate)} ${purchase.status === "SOLD" ? "卖出" : "报废"}` : " → 持有中"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Panel index="01" title={`追加费用 / ${events.length}`}>
            <PurchaseEventsPanel
              purchaseId={purchase.id}
              currency={cur}
              events={events.map((e) => ({
                id: e.id,
                kind: e.kind,
                amount: e.amount,
                currency: e.currency,
                amountBase: e.amountBase,
                date: isoDay(e.date),
                extendDays: e.extendDays,
                note: e.note,
              }))}
            />
          </Panel>
          <Panel
            index="02"
            title={`收益记录 / ${incomes.length}`}
            actions={
              <a href={`/purchases/${purchase.id}/incomes`} className="text-[10px] uppercase tracking-wider text-neutral-500 f-mono hover:text-black">
                全部 →
              </a>
            }
          >
            <PurchaseIncomePanel
              purchaseId={purchase.id}
              currency={cur}
              incomes={incomes.map((i) => ({
                id: i.id,
                amount: i.amount,
                amountBase: i.amountBase,
                date: isoDay(i.date),
                note: i.note,
              }))}
            />
          </Panel>
        </div>

        {inUse && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Panel index="03" title="卖出登记">
              <form action={closePurchaseAction.bind(null, purchase.id)} className="space-y-4 px-4 py-4">
                <input type="hidden" name="status" value="SOLD" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <Panel index="04" title="报废登记">
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
