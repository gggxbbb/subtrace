import Link from "next/link";
import { isoDay, wallParts } from "@/lib/dates";
import { redirect } from "next/navigation";
import { Kpi, Panel, fmt, ORANGE } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { getReportData, monthRange, yearRange } from "@/lib/reports";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | undefined): { kind: "month" | "year"; year: number; month: number } {
  const now = new Date();
  const m = raw?.match(/^(\d{4})(?:-(\d{2}))?$/);
  const wp = wallParts(now);
  if (!m) return { kind: "month", year: wp.year, month: wp.month + 1 };
  if (m[2]) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) return { kind: "month", year: wp.year, month: wp.month + 1 };
    return { kind: "month", year: Number(m[1]), month };
  }
  return { kind: "year", year: Number(m[1]), month: 1 };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { period } = await searchParams;
  const p = parsePeriod(period);

  const { startMs, endMs, label, prevHref, nextHref } =
    p.kind === "month"
      ? {
          ...monthRange(p.year, p.month),
          label: `${p.year} 年 ${p.month} 月`,
          prevHref: `/reports?period=${p.month === 1 ? `${p.year - 1}-12` : `${p.year}-${String(p.month - 1).padStart(2, "0")}`}`,
          nextHref: `/reports?period=${p.month === 12 ? `${p.year + 1}-01` : `${p.year}-${String(p.month + 1).padStart(2, "0")}`}`,
        }
      : {
          ...yearRange(p.year),
          label: `${p.year} 年`,
          prevHref: `/reports?period=${p.year - 1}`,
          nextHref: `/reports?period=${p.year + 1}`,
        };

  const currentPeriod = p.kind === "month" ? `${p.year}-${String(p.month).padStart(2, "0")}` : `${p.year}`;
  const r = await getReportData(user.id, startMs, endMs, label);
  // 环比：上一期同长度区间
  const prevRange =
    p.kind === "month"
      ? p.month === 1
        ? monthRange(p.year - 1, 12)
        : monthRange(p.year, p.month - 1)
      : yearRange(p.year - 1);
  const prev = await getReportData(user.id, prevRange.startMs, prevRange.endMs, "");
  const delta = prev.totalAmortized > 0 ? (r.totalAmortized - prev.totalAmortized) / prev.totalAmortized : null;

  // 趋势：月视图逐日柱；年视图聚合 12 个月
  const todayIso = isoDay(new Date());
  const bars = r.days.map((d) => ({
    label: p.kind === "month" ? d.date.slice(8) : d.date.slice(5),
    cost: d.cost,
    isToday: d.date === todayIso,
  }));
  const maxCost = Math.max(...bars.map((b) => b.cost), 1);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            05 / reports
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">报表</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="grid grid-cols-2 gap-px border border-black bg-black">
            <Link
              href={`/reports?period=${currentPeriod.length > 4 ? currentPeriod : `${p.year}-${String(wallParts(new Date()).month + 1).padStart(2, "0")}`}`}
              className={`px-3 py-2 text-[10px] uppercase tracking-wider f-mono ${p.kind === "month" ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
            >
              月
            </Link>
            <Link
              href={`/reports?period=${p.year}`}
              className={`px-3 py-2 text-[10px] uppercase tracking-wider f-mono ${p.kind === "year" ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
            >
              年
            </Link>
          </div>
          <Link href={prevHref} className="border border-black bg-white px-3 py-2 text-[10px] f-mono hover:bg-black hover:text-white">←</Link>
          <span className="min-w-28 text-center text-[12px] font-semibold">{label}</span>
          <Link href={nextHref} className="border border-black bg-white px-3 py-2 text-[10px] f-mono hover:bg-black hover:text-white">→</Link>
        </div>
      </header>

      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-4 gap-4">
          <Kpi
            index="R1"
            label="摊销成本"
            value={fmt(r.totalAmortized)}
            sub={delta != null ? `较上期 ${delta >= 0 ? "+" : ""}${Math.round(delta * 100)}%` : "成本段按天切片"}
            led={delta != null ? (delta <= 0 ? "#22c55e" : "#ef4444") : undefined}
          />
          <Kpi index="R2" label="实付" value={fmt(r.totalPaid)} sub="区间内实际流出" />
          <Kpi index="R3" label="日均" value={fmt(r.dailyAvg)} sub="摊销口径" />
          <Kpi index="R4" label="分类数" value={`${r.categories.length}`} sub={r.categories[0] ? `最大：${r.categories[0].name}` : "—"} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Panel index="01" title="趋势">
            <div className="px-4 py-4">
              <div className="flex h-36 items-end gap-px">
                {bars.map((b, i) => (
                  <div key={i} className="group relative h-full flex-1" title={`${b.label} · ${fmt(b.cost)}`}>
                    <div
                      className="w-full"
                      style={{
                        height: `${Math.max(2, (b.cost / maxCost) * 100)}%`,
                        background: b.isToday ? ORANGE : "#111",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[9px] uppercase text-neutral-400 f-mono">
                <span>{bars[0]?.label}</span>
                <span>峰值 {fmt(maxCost)}</span>
                <span>{bars[bars.length - 1]?.label}</span>
              </div>
            </div>
          </Panel>

          <Panel index="02" title="分类占比">
            <div className="space-y-2.5 px-4 py-4">
              {r.categories.length === 0 && (
                <div className="py-4 text-center text-[11px] uppercase text-neutral-400 f-mono">区间内无成本</div>
              )}
              {r.categories.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span>{c.name}</span>
                    <span className="tabular-nums f-mono">
                      {fmt(c.cost)} · {Math.round(c.share * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-[#E4E3E0]">
                    <div className="h-full bg-black" style={{ width: `${Math.round(c.share * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel index="03" title={`明细 / ${r.items.length}`}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-black text-left text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">分类</th>
                <th className="px-4 py-2 w-2/5 font-medium">占比</th>
                <th className="px-4 py-2 text-right font-medium">摊销成本</th>
                <th className="px-4 py-2 text-right font-medium">日均</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((it) => (
                <tr key={it.id} className="border-b border-neutral-200 last:border-0 hover:bg-black/[0.03]">
                  <td className="px-4 py-2">
                    <a
                      href={it.kind === "sub" ? `/subscriptions/${it.id}` : `/purchases/${it.id}`}
                      className="font-medium hover:underline"
                    >
                      {it.name}
                    </a>
                    <span className="ml-1.5 text-[9px] uppercase text-neutral-400 f-mono">
                      {it.kind === "sub" ? "订阅" : "物品"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{it.category}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 bg-[#E4E3E0]">
                        <div className="h-full bg-black" style={{ width: `${Math.max(1, Math.round(it.share * 100))}%` }} />
                      </div>
                      <span className="w-10 text-right text-[10px] tabular-nums text-neutral-500 f-mono">
                        {Math.round(it.share * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-[11px] font-semibold tabular-nums f-mono">{fmt(it.cost)}</td>
                  <td className="px-4 py-2 text-right text-[11px] tabular-nums text-neutral-500 f-mono">
                    {fmt(it.cost / r.days.length)}
                  </td>
                </tr>
              ))}
              {r.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[11px] uppercase text-neutral-400 f-mono">
                    区间内无成本
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
