// 报表页（reports-redo ticket 02）：单长页五层——Header 三档切换 / KPI 行 / 01 用量盈亏回看 / 02 双口径趋势 / 03 分类占比 / 04 明细+导出。
// period 串三格式（月 YYYY-MM / 年 YYYY / 自定义 YYYY-MM-DD:YYYY-MM-DD）统一走 parseReportPeriod（ticket 01）；
// 非法 period 回退当前月。用量板块为 ADR-0015 回看口径，与详情页同一引擎。

import Link from "next/link";
import { redirect } from "next/navigation";
import { Kpi, Led, Panel } from "@/components/te";
import { TrendChart } from "@/components/reports/TrendChart";
import { PageHeader } from "@/components/PageHeader";
import { fmtMoney } from "@/lib/format";
import { DAY_MS, isoDay, wallParts } from "@/lib/dates";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getReportData,
  monthRange,
  parseReportPeriod,
  yearRange,
  type ReportPeriod,
  type ReportUsageRow,
} from "@/lib/reports";
import { pnlTone } from "@/lib/usage/pnl";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<ReportUsageRow["kind"], string> = {
  COUNT: "计数型",
  QUOTA: "额度型",
  SAVINGS: "省钱型",
};

/** 净盈亏单元格：pnlTone 四态——盈 income / 亏 destructive / 未知灰显注明 / 无行 "—"（口径同订阅列表 PnlValue） */
function UsageNet({ row, cur }: { row: ReportUsageRow; cur: string }) {
  const tone = pnlTone({ verdictAmount: row.net, costUnknown: row.costUnknown, valueUnknown: row.valueUnknown });
  if (tone === "unknown") {
    return (
      <span
        className="text-faint"
        title={
          row.valueUnknown && row.costUnknown
            ? "成本未记录且替代单价未填，盈亏不可信"
            : row.valueUnknown
              ? "替代单价未填，价值未知，可边用边补"
              : "成本未记录，盈亏不可信"
        }
      >
        {row.valueUnknown && row.costUnknown ? "成本/价值未知" : row.valueUnknown ? "价值未知" : "成本未知"}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold tabular-nums f-mono ${tone === "pos" ? "text-income" : "text-destructive"}`}
      title={row.valuePartial ? "部分记录无单价，仅计有单价部分" : undefined}
    >
      {tone === "pos" ? "+" : "−"}
      {fmtMoney(Math.abs(row.net), cur)}
      <Led color={tone === "pos" ? "#22c55e" : "#ef4444"} />
      {row.valuePartial && <span className="text-[9px] text-faint">部分</span>}
    </span>
  );
}

/** R4 区间盈亏卡：Kpi 同版式，值随 pnlTone 四态着色（hasUnknown 灰显 + title 注明；无量化订阅行为未跟踪态 "—"） */
function NetKpi({
  net,
  hasUnknown,
  rows,
  sub,
  cur,
}: {
  net: number;
  hasUnknown: boolean;
  rows: number;
  sub: string;
  cur: string;
}) {
  const tone = rows === 0 ? "none" : pnlTone({ verdictAmount: net, costUnknown: hasUnknown });
  const valueCls =
    tone === "unknown" || tone === "none"
      ? "text-faint"
      : tone === "pos"
        ? "text-income"
        : "text-destructive";
  return (
    <div
      className="border border-ink bg-surface p-4"
      title={hasUnknown ? "含成本/价值未知的行，汇总仅供参考" : "区间内量化订阅的用回价值 − 摊销成本"}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.15em] text-muted f-mono">
        <span className="min-w-0 truncate" title="区间盈亏">区间盈亏</span>
        <span className="flex shrink-0 items-center gap-1.5 text-faint">
          R4{" "}
          {tone !== "none" && (
            <Led color={tone === "unknown" ? "#a3a3a3" : tone === "pos" ? "#22c55e" : "#ef4444"} />
          )}
        </span>
      </div>
      <div className={`mt-2 truncate text-[28px] font-bold leading-none tracking-tight tabular-nums ${valueCls}`}>
        {tone === "none" ? "—" : `${net >= 0 ? "+" : "−"}${fmtMoney(Math.abs(net), cur)}`}
      </div>
      <div className="mt-2 truncate text-[10px] text-muted f-mono" title={sub}>{sub}</div>
    </div>
  );
}

function countdownText(cd: NonNullable<ReportUsageRow["countdown"]>): string {
  const verb = cd.kind === "reset" ? "重置" : "到期";
  if (cd.days > 0) return `${cd.days} 天后${verb}`;
  if (cd.days === 0) return `今天${verb}`;
  return `已${verb} ${-cd.days} 天`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cur = user.baseCurrency;
  const { period: rawPeriod, start: startQ, end: endQ } = await searchParams;
  const now = new Date();
  // 自定义表单以 start/end 两个 date input 提交（GET 表单拼不出冒号串），在此合流进统一解析出口
  const raw = startQ || endQ ? `${startQ ?? ""}:${endQ ?? ""}` : rawPeriod;
  const p: ReportPeriod = parseReportPeriod(raw, now) ?? parseReportPeriod(undefined, now)!;

  const wpStart = wallParts(new Date(p.startMs));
  const todayIso = isoDay(now);

  // 翻页与环比：月/年按日历推进；自定义档无翻页，环比取上一段同长度区间
  let prevHref: string | null = null;
  let nextHref: string | null = null;
  let prevRange: { startMs: number; endMs: number };
  if (p.kind === "month") {
    const y = wpStart.year;
    const m = wpStart.month + 1;
    prevHref = `/reports?period=${m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`}`;
    nextHref = `/reports?period=${m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`}`;
    prevRange = m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
  } else if (p.kind === "year") {
    const y = wpStart.year;
    prevHref = `/reports?period=${y - 1}`;
    nextHref = `/reports?period=${y + 1}`;
    prevRange = yearRange(y - 1);
  } else {
    prevRange = { startMs: p.startMs - (p.endMs - p.startMs), endMs: p.startMs };
  }

  const [r, prev] = await Promise.all([
    getReportData(user.id, p.startMs, p.endMs, p.label),
    getReportData(user.id, prevRange.startMs, prevRange.endMs, ""),
  ]);
  const delta = prev.totalAmortized > 0 ? (r.totalAmortized - prev.totalAmortized) / prev.totalAmortized : null;

  // 三档切换目标：月 → 当前月；年 → 区间起所在年；自定义 → 当前区间转 custom 串（止期夹到今儿，未来止期会被解析拒绝）
  const wpNow = wallParts(now);
  const monthHref =
    p.kind === "month"
      ? `/reports?period=${p.period}`
      : `/reports?period=${wpNow.year}-${String(wpNow.month + 1).padStart(2, "0")}`;
  const yearHref = `/reports?period=${wpStart.year}`;
  const customStartIso = isoDay(new Date(p.startMs));
  const endInclusiveIso = isoDay(new Date(p.endMs - DAY_MS));
  const customEndClamped = endInclusiveIso > todayIso ? todayIso : endInclusiveIso;
  const customHref = `/reports?period=${customStartIso}:${customEndClamped}`;
  const [customStart, customEnd] = p.kind === "custom" ? p.period.split(":") : [customStartIso, customEndClamped];

  const tabCls = (active: boolean) =>
    `px-3 py-2 text-[10px] uppercase tracking-wider f-mono ${active ? "bg-ink text-surface" : "bg-surface hover:bg-base"}`;

  const deltaText = delta != null ? `较上期 ${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}% · ` : "";

  return (
    <>
      <PageHeader
        crumb={<>05 / reports</>}
        title={<>报表</>}
        actions={
          <>
            <div className="grid grid-cols-3 gap-px border border-ink bg-ink">
              <Link href={monthHref} className={tabCls(p.kind === "month")}>月</Link>
              <Link href={yearHref} className={tabCls(p.kind === "year")}>年</Link>
              <Link href={customHref} className={tabCls(p.kind === "custom")}>自定义</Link>
            </div>
            {prevHref && (
              <Link href={prevHref} className="border border-ink bg-surface px-3 py-2 text-[10px] f-mono hover:bg-ink hover:text-surface">←</Link>
            )}
            <span className="min-w-28 text-center text-[12px] font-semibold">{p.label}</span>
            {nextHref && (
              <Link href={nextHref} className="border border-ink bg-surface px-3 py-2 text-[10px] f-mono hover:bg-ink hover:text-surface">→</Link>
            )}
          </>
        }
      />
      {p.kind === "custom" && (
        <div className="border-b border-ink bg-base px-4 md:px-6">
          <form action="/reports" method="get" className="flex flex-wrap items-end gap-2 pb-3">
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted f-mono">
              起
              <input
                type="date"
                name="start"
                defaultValue={customStart}
                max={todayIso}
                required
                className="mt-0.5 block border border-ink bg-base px-2 py-1.5 text-sm normal-case tracking-normal outline-none focus:bg-surface"
              />
            </label>
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted f-mono">
              止（含当日）
              <input
                type="date"
                name="end"
                defaultValue={customEnd}
                max={todayIso}
                required
                className="mt-0.5 block border border-ink bg-base px-2 py-1.5 text-sm normal-case tracking-normal outline-none focus:bg-surface"
              />
            </label>
            <button
              type="submit"
              className="border border-ink bg-ink px-4 py-1.5 text-[10px] uppercase tracking-wider text-surface f-mono hover:bg-ink-hover"
            >
              应用
            </button>
          </form>
        </div>
      )}

      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Kpi
            index="R1"
            label="摊销成本"
            value={fmtMoney(r.totalAmortized, cur)}
            sub={`${deltaText}订阅 ${fmtMoney(r.subAmortized, cur)} · 物品 ${fmtMoney(r.itemAmortized, cur)}`}
            led={delta != null ? (delta <= 0 ? "#22c55e" : "#ef4444") : undefined}
          />
          <Kpi index="R2" label="实付" value={fmtMoney(r.totalPaid, cur)} sub="区间内实际流出" />
          <Kpi index="R3" label="日均" value={fmtMoney(r.dailyAvg, cur)} sub={`订阅 ${fmtMoney(r.subDailyAvg, cur)} · 物品 ${fmtMoney(r.itemDailyAvg, cur)}`} />
          <NetKpi
            net={r.usageTotal.net}
            hasUnknown={r.usageTotal.hasUnknown}
            rows={r.usageRows.length}
            sub={`付了 ${fmtMoney(r.usageTotal.paid, cur)} · 用回 ${fmtMoney(r.usageTotal.value, cur)}`}
            cur={cur}
          />
        </div>

        <Panel index="01" title="用量盈亏 · 区间回看" action={`${r.usageRows.length} 项`}>
          <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-ink text-left text-[9px] uppercase tracking-[0.15em] text-muted f-mono">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 text-right font-medium">付了</th>
                <th className="px-4 py-2 text-right font-medium">用回</th>
                <th className="px-4 py-2 text-right font-medium">净盈亏</th>
                <th className="px-4 py-2 text-right font-medium">每次实际成本</th>
                <th className="px-4 py-2 font-medium">倒计时</th>
              </tr>
            </thead>
            <tbody>
              {r.usageRows.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-black/[0.03]">
                  <td className="px-4 py-2.5">
                    <a href={`/subscriptions/${u.id}`} className="font-medium hover:underline">
                      {u.name}
                    </a>
                    <span className="ml-1.5 text-[9px] uppercase text-faint f-mono">{KIND_LABEL[u.kind]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span title={u.costUnknown ? "成本未记录，按 0 计" : undefined}>{fmtMoney(u.paid, cur)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {u.valueUnknown ? (
                      <span className="text-faint" title="替代单价未填，价值未知，可边用边补">未知</span>
                    ) : (
                      <span title={u.valuePartial ? "部分记录无单价，仅计有单价部分" : undefined}>
                        {fmtMoney(u.value, cur)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <UsageNet row={u} cur={cur} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted f-mono">
                    {u.costPerUse == null ? (
                      "-"
                    ) : (
                      <>
                        {fmtMoney(u.costPerUse, cur)}
                        {u.unit && <span className="text-[9px] text-faint">/{u.unit}</span>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.countdown && (
                      <span
                        className="inline-block border border-line-strong px-1 py-px text-[9px] text-muted f-mono"
                        title={`${u.countdown.kind === "reset" ? "重置日" : "到期日"} ${u.countdown.date}`}
                      >
                        {countdownText(u.countdown)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {r.usageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
                    区间内无量化订阅
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Panel>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <Panel index="02" title="趋势 · 摊销 vs 实付">
            <TrendChart buckets={r.trend} currency={cur} />
          </Panel>

          <Panel index="03" title="分类占比">
            <div className="space-y-2.5 px-4 py-4">
              {r.categories.length === 0 && (
                <div className="py-4 text-center text-[11px] uppercase text-faint f-mono">区间内无成本</div>
              )}
              {r.categories.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span>{c.name}</span>
                    <span className="tabular-nums f-mono">
                      {fmtMoney(c.cost, cur)} · {Math.round(c.share * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-base">
                    <div className="h-full bg-ink" style={{ width: `${Math.round(c.share * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          index="04"
          title={`明细 / ${r.items.length}`}
          actions={
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider f-mono">
              <a
                href={`/reports/export/items.csv?period=${encodeURIComponent(p.period)}`}
                className="text-muted hover:text-ink"
              >
                明细.csv
              </a>
              <a
                href={`/reports/export/payments.csv?period=${encodeURIComponent(p.period)}`}
                className="text-muted hover:text-ink"
              >
                实付流水.csv
              </a>
            </div>
          }
        >
          <div className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-ink text-left text-[9px] uppercase tracking-[0.15em] text-muted f-mono">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">分类</th>
                <th className="px-4 py-2 w-2/5 font-medium">占比</th>
                <th className="px-4 py-2 text-right font-medium">摊销成本</th>
                <th className="px-4 py-2 text-right font-medium">日均</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((it) => (
                <tr key={it.id} className="border-b border-line last:border-0 hover:bg-black/[0.03]">
                  <td className="px-4 py-2">
                    <a
                      href={it.kind === "sub" ? `/subscriptions/${it.id}` : `/purchases/${it.id}`}
                      className="font-medium hover:underline"
                    >
                      {it.name}
                    </a>
                    <span className="ml-1.5 text-[9px] uppercase text-faint f-mono">
                      {it.kind === "sub" ? "订阅" : "物品"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted">{it.category}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 bg-base">
                        <div className="h-full bg-ink" style={{ width: `${Math.max(1, Math.round(it.share * 100))}%` }} />
                      </div>
                      <span className="w-10 text-right text-[10px] tabular-nums text-muted f-mono">
                        {Math.round(it.share * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-[13px] font-semibold tabular-nums">{fmtMoney(it.cost, cur)}</td>
                  <td className="px-4 py-2 text-right text-[11px] tabular-nums text-muted f-mono">
                    {fmtMoney(it.daily, cur)}
                  </td>
                </tr>
              ))}
              {r.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
                    区间内无成本
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
