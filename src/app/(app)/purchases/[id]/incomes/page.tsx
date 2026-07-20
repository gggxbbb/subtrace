import { notFound, redirect } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import { getPurchase, listPurchaseIncomes } from "@/lib/purchases/service";
import { IncomesManager, type IncomeRow } from "./IncomesManager";

export const dynamic = "force-dynamic";

export default async function IncomesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const purchase = await getPurchase(user.id, id);
  if (!purchase) notFound();

  const q = (sp.q ?? "").trim().toLowerCase();
  const from = sp.from ? new Date(`${sp.from}T00:00:00+08:00`) : null;
  const to = sp.to ? new Date(`${sp.to}T00:00:00+08:00`) : null;

  const all = await listPurchaseIncomes(purchase.id);
  let rows: IncomeRow[] = all.map((i) => ({
    id: i.id,
    amount: i.amount,
    currency: i.currency,
    amountBase: i.amountBase,
    date: isoDay(i.date),
    note: i.note,
  }));
  if (q) rows = rows.filter((r) => (r.note ?? "").toLowerCase().includes(q));
  if (from) rows = rows.filter((r) => new Date(`${r.date}T00:00:00+08:00`) >= from);
  if (to) rows = rows.filter((r) => new Date(`${r.date}T00:00:00+08:00`) <= to);
  rows = rows.reverse();

  const back = new URLSearchParams(
    Object.entries({ q: sp.q, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            purchases / {purchase.name} / incomes
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">收益记录管理</h1>
        </div>
        <a
          href={`/purchases/${purchase.id}`}
          className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white"
        >
          ← 返回物品
        </a>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <IncomesManager
          purchaseId={purchase.id}
          rows={rows}
          total={all.length}
          filters={{ q: sp.q ?? "", from: sp.from ?? "", to: sp.to ?? "" }}
          back={back}
        />
      </main>
    </>
  );
}
