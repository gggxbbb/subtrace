import Link from "next/link";
import { isoDay } from "@/lib/dates";
import { Plus } from "lucide-react";
import { Panel, ORANGE } from "@/components/te";
import { fmtMoney } from "@/lib/format";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { ListToolbar } from "@/components/ListToolbar";
import { matchesKeyword, parseListQuery, sortBy } from "@/lib/list-query";
import { getCurrentUser } from "@/lib/auth/session";
import { breakevenProgress, dayDiff, purchaseCurrentDailyRate } from "@/lib/cost-engine";
import { listArchivedPurchases, listPurchases, toEnginePurchase } from "@/lib/purchases/service";
import type { Purchase } from "@/generated/prisma/client";
import { ArchivedPurchaseList } from "./ArchivedPurchaseList";

type Row = Purchase & { daysHeld: number; dailyCost: number; progress: number | undefined };

async function buildRows(userId: string): Promise<Row[]> {
  const purchases = await listPurchases(userId);
  const today = new Date();
  return purchases.map((p) => {
    const engine = toEnginePurchase(p);
    return {
      ...p,
      daysHeld: dayDiff(p.purchaseDate, today),
      dailyCost: purchaseCurrentDailyRate(engine, today),
      progress: breakevenProgress(engine, today),
    };
  });
}

function PurchaseCards({ rows, cur }: { rows: Row[]; cur: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
        还没有物品，点右上角「登记物品」开始
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-px bg-surface sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((p) => (
        <Link key={p.id} href={`/purchases/${p.id}`} className="block border border-line bg-surface px-4 py-3 hover:bg-black/[0.03]">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-medium" title={p.name}>{p.name}</span>
            <span className="shrink-0 text-[9px] uppercase text-faint f-mono">
              {p.status === "IN_USE" ? `${p.daysHeld}d held` : p.status === "SOLD" ? "已卖出" : "已报废"}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full bg-base">
            <div
              className="h-full"
              style={{
                width: `${Math.round((p.progress ?? Math.min(1, p.daysHeld / 1095)) * 100)}%`,
                background: p.status === "IN_USE" ? ORANGE : "#999",
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] text-muted f-mono">
            <span>{p.status === "IN_USE" ? `${fmtMoney(p.dailyCost, cur)}/day` : "—"}</span>
            <span>{fmtMoney(p.amountBase, cur)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function PurchaseTable({ rows, cur }: { rows: Row[]; cur: string }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[680px] text-[13px]">
      <thead>
        <tr className="border-b border-ink text-left text-[9px] uppercase tracking-[0.15em] text-muted f-mono">
          <th className="px-4 py-2 font-medium">名称</th>
          <th className="px-4 py-2 font-medium">分类</th>
          <th className="px-4 py-2 font-medium">购入日期</th>
          <th className="px-4 py-2 text-right font-medium">金额</th>
          <th className="px-4 py-2 text-right font-medium">日均</th>
          <th className="px-4 py-2 text-right font-medium">持有</th>
          <th className="px-4 py-2 text-right font-medium">回本</th>
          <th className="px-4 py-2 font-medium">状态</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-line last:border-0 hover:bg-black/[0.03]">
            <td className="px-4 py-2.5">
              <Link href={`/purchases/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
            </td>
            <td className="px-4 py-2.5 text-muted">{p.category ?? "—"}</td>
            <td className="px-4 py-2.5 text-[11px] tabular-nums text-muted f-mono">
              {isoDay(p.purchaseDate)}
            </td>
            <td className="px-4 py-2.5 text-right text-[11px] tabular-nums f-mono">
              {fmtMoney(p.amountBase, cur)}
            </td>
            <td className="px-4 py-2.5 text-right text-[11px] font-semibold tabular-nums f-mono">
              {p.status === "IN_USE" ? fmtMoney(p.dailyCost, cur) : "—"}
            </td>
            <td className="px-4 py-2.5 text-right text-[11px] tabular-nums text-muted f-mono">
              {p.daysHeld}d
            </td>
            <td className="px-4 py-2.5 text-right text-[11px] tabular-nums f-mono">
              {p.progress != null ? `${Math.round(p.progress * 100)}%` : "—"}
            </td>
            <td className="px-4 py-2.5 text-[11px] text-muted">
              {p.status === "IN_USE" ? "使用中" : p.status === "SOLD" ? "已卖出" : "已报废"}
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
              还没有物品，点右上角「登记物品」开始
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  );
}

const SORT_KEYS = {
  name: { label: "名称", key: (r: Row) => r.name },
  purchaseDate: { label: "购入日期", key: (r: Row) => r.purchaseDate },
  daily: { label: "日均", key: (r: Row) => r.dailyCost },
  amount: { label: "金额", key: (r: Row) => r.amountBase },
} as const;
type SortKey = keyof typeof SORT_KEYS;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = (await getCurrentUser())!;
  const cur = user.baseCurrency;
  const all = await buildRows(user.id);
  const archived = await listArchivedPurchases(user.id);
  const sp = await searchParams;
  const { sort: sortRaw, dir, cat, status, q } = parseListQuery(sp);
  const sortKey = sortRaw as SortKey | undefined;

  let rows = all;
  if (cat) rows = rows.filter((r) => r.category === cat);
  if (status) rows = rows.filter((r) => r.status === status);
  if (q) rows = rows.filter((r) => matchesKeyword(r.name, q));
  if (sortKey && SORT_KEYS[sortKey]) rows = sortBy(rows, dir, SORT_KEYS[sortKey].key);

  const categories = Array.from(
    new Set(all.map((r) => r.category).filter((c): c is string => !!c)),
  ).sort();

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-ink bg-base px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted f-mono">
            03 / purchases
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">物品</h1>
        </div>
        <Link
          href="/purchases/new"
          className="flex items-center gap-1.5 bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 登记物品
        </Link>
      </header>

      <div className="px-4 py-5 md:px-6">
        <ViewSwitcher
          storageKey="subtrace:view:purchases"
          desktopDefault="card"
          toolbar={
            <ListToolbar
              sortOptions={Object.entries(SORT_KEYS).map(([value, o]) => ({ value, label: o.label }))}
              statusOptions={[
                { value: "IN_USE", label: "使用中" },
                { value: "SOLD", label: "已卖出" },
                { value: "RETIRED", label: "已报废" },
              ]}
              categories={categories}
              current={{ sort: sortKey, dir, cat, status, q }}
            />
          }
          card={
            <Panel index="01" title={`全部物品 / ${rows.length}`}>
              <PurchaseCards rows={rows} cur={cur} />
            </Panel>
          }
          list={
            <Panel index="01" title={`全部物品 / ${rows.length}`}>
              <PurchaseTable rows={rows} cur={cur} />
            </Panel>
          }
        />

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
