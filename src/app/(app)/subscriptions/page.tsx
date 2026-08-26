import Link from "next/link";
import { isoDay } from "@/lib/dates";
import { Plus } from "lucide-react";
import { ErrorBanner, Led, ORANGE, Panel } from "@/components/te";
import { fmtMoney } from "@/lib/format";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { ListToolbar } from "@/components/ListToolbar";
import { matchesKeyword, parseListQuery, sortBy, subStatusOf } from "@/lib/list-query";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardData, type DashboardRow } from "@/lib/dashboard";
import { listArchivedSubscriptions } from "@/lib/subscriptions/service";
import { pnlTone } from "@/lib/usage/pnl";
import { usageTuples, type UsageTuple } from "@/lib/usage/tuples";
import { ArchivedList } from "./ArchivedList";
import { QuickLogButtons } from "@/components/QuickLogButtons";

type Row = DashboardRow & {
  /** 当前区间盈亏（红黑榜同口径 getUsageVerdict）；未启用用量为 null */
  pnl: number | null;
  /** 覆盖段金额未知：盈亏不可信，灰显 */
  pnlUnknown: boolean;
  /** 计数型活跃订阅的快捷录入元组（cap 3）；其余为空 */
  quickTuples: UsageTuple[];
  usageUnit: string | null;
};

/** 盈亏单元格：盈 income / 亏 destructive / 成本未知灰显注明 / 未跟踪 "—"（表格与卡片共用；四态见 lib/usage/pnl） */
function PnlValue({ row, cur }: { row: Row; cur: string }) {
  const tone = pnlTone(row.pnl === null ? null : { verdictAmount: row.pnl, costUnknown: row.pnlUnknown });
  if (tone === "none") return <span className="text-faint">—</span>;
  if (tone === "unknown") {
    return (
      <span className="text-faint" title="成本未记录，盈亏不可信">
        未知
      </span>
    );
  }
  return (
    <span className={tone === "pos" ? "text-income" : "text-destructive"}>
      {tone === "pos" ? "+" : "−"}
      {fmtMoney(Math.abs(row.pnl!), cur)}
    </span>
  );
}

/** 到期状态徽标：表格与卡片视图共用（口径同 subStatusOf） */
function StatusPill({ s }: { s: Row }) {
  const st = subStatusOf(s);
  if (st === "cancelled") {
    return (
      <span className="flex w-fit shrink-0 items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono">
        <Led color="#ef4444" /> 已取消
      </span>
    );
  }
  if (st === "expired") {
    // subStatusOf 已担保 daysUntilExpiry < 0
    return (
      <span className="flex w-fit shrink-0 items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase text-white f-mono" style={{ background: "#ef4444" }}>
        <Led color="#fff" /> 过期 {-s.daysUntilExpiry!}d
      </span>
    );
  }
  if (st === "soon") {
    return (
      <span className="flex w-fit shrink-0 items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase text-surface f-mono" style={{ background: ORANGE }}>
        <Led color="#fff" /> {s.daysUntilExpiry!}d
      </span>
    );
  }
  return (
    <span className="flex w-fit shrink-0 items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono">
      <Led color="#22c55e" /> ok
    </span>
  );
}

function SubscriptionTable({ rows, cur, back }: { rows: Row[]; cur: string; back: string }) {
  return (
    <div className="overflow-x-auto no-scrollbar">
    <table className="w-full min-w-[640px] text-[13px]">
      <thead>
        <tr className="border-b border-ink text-left text-[9px] uppercase tracking-[0.15em] text-muted f-mono">
          <th className="px-4 py-2 font-medium">名称</th>
          <th className="px-4 py-2 font-medium">分类</th>
          <th className="px-4 py-2 font-medium">周期</th>
          <th className="px-4 py-2 font-medium">到期日</th>
          <th className="px-4 py-2 text-right font-medium">日均</th>
          <th className="px-4 py-2 text-right font-medium">月均</th>
          <th className="px-4 py-2 text-right font-medium">盈亏</th>
          <th className="px-4 py-2 font-medium">状态</th>
          <th className="px-4 py-2 font-medium">记账</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id} className="border-b border-line last:border-0 hover:bg-black/[0.03]">
            <td className="px-4 py-2.5">
              <Link href={`/subscriptions/${s.id}`} className="font-medium hover:underline">
                {s.name}
              </Link>
            </td>
            <td className="px-4 py-2.5 text-muted">{s.category ?? "—"}</td>
            <td className="px-4 py-2.5 text-[11px] text-muted f-mono">{s.cycleLabel}</td>
            <td className="px-4 py-2.5 text-[11px] tabular-nums text-muted f-mono">
              {s.expiry ? isoDay(s.expiry) : "—"}
            </td>
            <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums">
              {s.costUnknown && s.dailyCost === 0 ? (
                <span className="text-faint">未知</span>
              ) : (
                fmtMoney(s.dailyCost, cur)
              )}
            </td>
            <td className="px-4 py-2.5 text-right text-[11px] tabular-nums text-muted f-mono">
              {s.costUnknown && s.dailyCost === 0 ? "—" : fmtMoney(s.monthlyCost, cur)}
            </td>
            <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular-nums">
              <PnlValue row={s} cur={cur} />
            </td>
            <td className="px-4 py-2.5">
              <StatusPill s={s} />
            </td>
            <td className="px-4 py-2.5">
              <QuickLogButtons subscriptionId={s.id} tuples={s.quickTuples} unit={s.usageUnit} back={back} />
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={9} className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
              还没有订阅，点右上角「新建订阅」开始
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  );
}

function SubscriptionCards({ rows, cur, back }: { rows: Row[]; cur: string; back: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
        还没有订阅，点右上角「新建订阅」开始
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-px bg-surface sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((s) => (
        <div key={s.id} className="border border-line bg-surface px-4 py-3 hover:bg-black/[0.03]">
          <Link href={`/subscriptions/${s.id}`} className="block">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-medium" title={s.name}>
                {s.name}
              </span>
              <StatusPill s={s} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] text-muted f-mono">
              <span className="min-w-0 truncate">
                {s.category ?? "—"} · {s.cycleLabel}
              </span>
              <span className="shrink-0 tabular-nums">{s.expiry ? isoDay(s.expiry) : "—"}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between text-[11px] tabular-nums">
              <span className="text-[13px] font-semibold">
                {s.costUnknown && s.dailyCost === 0 ? "未知" : `${fmtMoney(s.dailyCost, cur)}/day`}
              </span>
              <span className="text-muted f-mono">
                {s.costUnknown && s.dailyCost === 0 ? "—" : `${fmtMoney(s.monthlyCost, cur)}/mo`}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between text-[11px] tabular-nums">
              <span className="text-[9px] uppercase text-faint f-mono">盈亏</span>
              <span className="text-[13px] font-semibold">
                <PnlValue row={s} cur={cur} />
              </span>
            </div>
          </Link>
          {s.quickTuples.length > 0 && (
            <div className="mt-2 border-t border-dashed border-line pt-2">
              <QuickLogButtons subscriptionId={s.id} tuples={s.quickTuples} unit={s.usageUnit} back={back} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const SORT_KEYS = {
  name: { label: "名称", key: (r: Row) => r.name },
  expiry: { label: "到期日", key: (r: Row) => r.expiry },
  daily: { label: "日均", key: (r: Row) => r.dailyCost },
  monthly: { label: "月均", key: (r: Row) => r.monthlyCost },
  pnl: { label: "盈亏", key: (r: Row) => r.pnl },
} as const;
type SortKey = keyof typeof SORT_KEYS;

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = (await getCurrentUser())!;
  const cur = user.baseCurrency;
  const d = await getDashboardData(user.id);
  const archived = await listArchivedSubscriptions(user.id);
  const sp = await searchParams;
  const { sort: sortRaw, dir, cat, status, q } = parseListQuery(sp);
  const sortKey = sortRaw as SortKey | undefined;
  const error = typeof sp.error === "string" ? sp.error : null;

  // 盈亏列 + 快捷录入共用 getDashboardData 的用量装配（红黑榜同口径、同一来源，无重复流水线）

  // 回跳地址带当前列表 searchParams：快捷录入失败/成功后排序筛选状态不丢
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k !== "error" && typeof v === "string" && v) qs.set(k, v);
  }
  const back = `/subscriptions${qs.size ? `?${qs.toString()}` : ""}`;

  let rows: Row[] = d.rows.map((r) => {
    const u = d.usageById.get(r.id);
    return {
      ...r,
      pnl: u?.verdict?.verdictAmount ?? null,
      pnlUnknown: u?.verdict?.costUnknown ?? false,
      quickTuples:
        u && u.sub.usageKind === "COUNT" && r.status === "ACTIVE"
          // 快捷元组按人切片（ADR-0003）：只从我的历史记录提取，与详情页口径一致
          ? usageTuples(u.records.filter((x) => x.userId === user.id), 3)
          : [],
      usageUnit: u?.sub.usageUnit ?? null,
    };
  });
  if (cat) rows = rows.filter((r) => r.category === cat);
  if (status) rows = rows.filter((r) => subStatusOf(r) === status);
  if (q) rows = rows.filter((r) => matchesKeyword(r.name, q));
  if (sortKey && SORT_KEYS[sortKey]) rows = sortBy(rows, dir, SORT_KEYS[sortKey].key);

  const categories = Array.from(
    new Set(d.rows.map((r) => r.category).filter((c): c is string => !!c)),
  ).sort();

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-ink bg-base px-4 md:px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted f-mono">
            02 / subscriptions
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">订阅</h1>
        </div>
        <Link
          href="/subscriptions/new"
          className="flex items-center gap-1.5 bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 新建订阅
        </Link>
      </header>

      <div className="px-4 py-5 md:px-6">
        <ErrorBanner error={error} defaultMessage="快捷录入失败，请进详情页录入" className="mb-4" />
        <ViewSwitcher
          storageKey="subtrace:view:subscriptions"
          desktopDefault="list"
          toolbar={
            <ListToolbar
              sortOptions={Object.entries(SORT_KEYS).map(([value, o]) => ({ value, label: o.label }))}
              statusOptions={[
                { value: "ok", label: "正常" },
                { value: "soon", label: "临期" },
                { value: "expired", label: "已过期" },
                { value: "cancelled", label: "已取消" },
              ]}
              categories={categories}
              current={{ sort: sortKey, dir, cat, status, q }}
            />
          }
          list={
            <Panel index="01" title={`全部订阅 / ${rows.length}`}>
              <SubscriptionTable rows={rows} cur={cur} back={back} />
            </Panel>
          }
          card={
            <Panel index="01" title={`全部订阅 / ${rows.length}`}>
              <SubscriptionCards rows={rows} cur={cur} back={back} />
            </Panel>
          }
        />

        {archived.length > 0 && (
          <div className="mt-4">
            <Panel index="02" title={`已归档 / ${archived.length}`}>
              <ArchivedList
                rows={archived.map((a) => ({
                  id: a.id,
                  name: a.name,
                  category: a.category,
                  startDate: isoDay(a.startDate),
                }))}
              />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
