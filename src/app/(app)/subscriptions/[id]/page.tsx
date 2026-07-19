import { notFound } from "next/navigation";
import { Kpi, Led, Panel, fmt, fmtDate } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { currentDailyRate, currentExpiry, dayDiff } from "@/lib/cost-engine";
import {
  getSubscription,
  paymentPrefill,
  toEnginePayments,
  toEngineSub,
} from "@/lib/subscriptions/service";
import { setStatusAction } from "@/lib/subscriptions/actions";
import { PaymentForm } from "./PaymentForm";

const SOURCE_LABEL: Record<string, string> = {
  AUTO: "自动扣费",
  MANUAL: "手动续费",
  PROMO: "活动价",
  BUNDLE: "联合会员",
};

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = (await getCurrentUser())!;
  const sub = await getSubscription(user.id, id);
  if (!sub) notFound();

  const today = new Date();
  const engineSub = toEngineSub(sub);
  const payments = toEnginePayments(sub.payments);
  const expiry = currentExpiry(engineSub, payments, today);
  const daily = currentDailyRate(engineSub, payments, today);
  const totalPaid = sub.payments.reduce((s, p) => s + p.amountBase - p.refundedBase, 0);
  const prefillRaw = paymentPrefill(sub, sub.payments);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const prefill = {
    paidAt: iso(today),
    periodStart: iso(prefillRaw.periodStart),
    periodEnd: iso(prefillRaw.periodEnd),
    amount: prefillRaw.amountBase,
    currency: sub.listCurrency ?? "CNY",
  };

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            subscriptions / {sub.category ?? "uncategorized"}
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">{sub.name}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          {sub.status === "ACTIVE" ? (
            <form action={setStatusAction.bind(null, sub.id, "CANCELLED")}>
              <button className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white">
                标记取消（到期即止）
              </button>
            </form>
          ) : (
            <form action={setStatusAction.bind(null, sub.id, "ACTIVE")}>
              <button className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white">
                恢复活跃
              </button>
            </form>
          )}
          <form action={setStatusAction.bind(null, sub.id, "ARCHIVED")}>
            <button className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 f-mono hover:bg-black hover:text-white">
              归档
            </button>
          </form>
        </div>
      </header>

      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-4 gap-4">
          <Kpi index="B1" label="当前到期日" value={expiry ? fmtDate(expiry) : "—"} sub={expiry ? `${dayDiff(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), expiry)} 天后（当天起不再覆盖）` : "手动模式待记录"} />
          <Kpi index="B2" label="当日费率" value={fmt(daily)} sub={`≈ 每月 ${fmt(daily * 30.4)}`} />
          <Kpi index="B3" label="累计实付" value={fmt(totalPaid)} sub={`${sub.payments.length} 笔付费记录`} />
          <Kpi
            index="B4"
            label="状态"
            value={sub.status === "ACTIVE" ? "活跃" : sub.status === "CANCELLED" ? "已取消" : "已归档"}
            sub={sub.autoRenew ? "自动续费" : "手动续费"}
            led={sub.status === "ACTIVE" ? "#22c55e" : "#ef4444"}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Panel index="01" title="记一笔付费">
            <PaymentForm subscriptionId={sub.id} prefill={prefill} />
          </Panel>

          <Panel index="02" title={`付费历史 / ${sub.payments.length}`}>
            {sub.payments.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
                还没有付费记录
              </div>
            )}
            {[...sub.payments].reverse().map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0">
                <div>
                  <div className="text-[13px] font-medium">
                    {fmt(p.amountBase)}
                    {p.refundedBase > 0 && (
                      <span className="ml-2 text-[10px] text-neutral-400 f-mono">
                        退 {fmt(p.refundedBase)} · 净 {fmt(p.amountBase - p.refundedBase)}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-neutral-400 f-mono">
                    {fmtDate(p.periodStart)} → {fmtDate(p.periodEnd)} · {SOURCE_LABEL[p.source] ?? p.source}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <Led color={p.source === "PROMO" ? "#FF5A00" : "#22c55e"} />
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
