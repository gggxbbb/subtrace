import { notFound, redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscription } from "@/lib/subscriptions/service";
import { planRechain } from "@/lib/subscriptions/service";
import { RechainBanner } from "../RechainBanner";
import { PaymentsManager, type PaymentRow } from "./PaymentsManager";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; source?: string; from?: string; to?: string; rechain?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const sub = await getSubscription(user.id, id);
  if (!sub) notFound();

  // URL query 驱动筛选：备注文本 / 来源 / 区间
  const q = (sp.q ?? "").trim().toLowerCase();
  const source = sp.source ?? "";
  const from = sp.from ? new Date(`${sp.from}T00:00:00+08:00`) : null;
  const to = sp.to ? new Date(`${sp.to}T00:00:00+08:00`) : null;

  let rows: PaymentRow[] = sub.payments.map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    amountBase: p.amountBase,
    refundedBase: p.refundedBase,
    paidAt: isoDay(p.paidAt),
    periodStart: isoDay(p.periodStart),
    periodEnd: isoDay(p.periodEnd),
    source: p.source,
    note: p.note,
  }));
  if (q) rows = rows.filter((r) => (r.note ?? "").toLowerCase().includes(q));
  if (source) rows = rows.filter((r) => r.source === source);
  if (from) rows = rows.filter((r) => new Date(`${r.paidAt}T00:00:00+08:00`) >= from);
  if (to) rows = rows.filter((r) => new Date(`${r.paidAt}T00:00:00+08:00`) <= to);
  rows = rows.reverse();

  const back = new URLSearchParams(
    Object.entries({ q: sp.q, source: sp.source, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            subscriptions / {sub.name} / payments
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">付费记录管理</h1>
        </div>
        <a
          href={`/subscriptions/${sub.id}`}
          className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white"
        >
          ← 返回订阅
        </a>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 p-6">
        {sp.rechain === "1" && (() => {
          const plan = planRechain(sub.payments);
          if (!plan) return null;
          const sorted = [...sub.payments].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
          const idx = sorted.findIndex((p) => p.id === plan.shifts[0].paymentId);
          return (
            <RechainBanner
              subscriptionId={sub.id}
              shiftCount={sorted.length - idx}
              deltaDays={plan.shifts[0].deltaDays}
              back={back}
            />
          );
        })()}
        <PaymentsManager
          subscriptionId={sub.id}
          rows={rows}
          total={sub.payments.length}
          filters={{ q: sp.q ?? "", source, from: sp.from ?? "", to: sp.to ?? "" }}
          back={back}
          canEdit={sub.ownerId === user.id}
          defaultCurrency={sub.listCurrency ?? user.baseCurrency}
          currency={user.baseCurrency}
        />
      </main>
    </>
  );
}
