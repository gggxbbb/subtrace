import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { Kpi, Led, LedMatrix, ORANGE, Panel, fmt, fmtDate } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard";
import { logoutAction } from "@/lib/auth/actions";

/** 点阵趋势屏：30 天插值铺满，柱高=当日摊销，柱顶白点、柱身橙点 */
function LedTrendChart({ data }: { data: number[] }) {
  const rows = 8;
  const max = Math.max(...data, 0.01) * 1.1;
  const heights = data.map((v) => Math.max(0, Math.round((v / max) * rows)));
  const cols: number[] = [];
  for (let i = 0; i < heights.length - 1; i++) {
    const a = heights[i];
    const b = heights[i + 1];
    cols.push(a, Math.round(a + (b - a) / 3), Math.round(a + ((b - a) * 2) / 3));
  }
  cols.push(heights[heights.length - 1]);
  return (
    <div className="bg-[#111] px-4 py-4">
      <LedMatrix
        rows={rows}
        cols={cols.length}
        size={9}
        gap={4}
        dark
        stretch
        lit={(r, c) => {
          const h = cols[c];
          const fromBottom = rows - 1 - r;
          if (h === 0 || fromBottom >= h) return false;
          return fromBottom === h - 1 ? "#F5F4F0" : true;
        }}
      />
    </div>
  );
}

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const d = await getDashboardData(user.id);
  const avg = d.trend.reduce((s, v) => s + v, 0) / d.trend.length;

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-black bg-[#E4E3E0] px-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
            01 / overview
          </div>
          <h1 className="text-xl font-bold uppercase tracking-tight">控制台</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/subscriptions/new"
            className="flex items-center gap-1.5 bg-black px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 新建订阅
          </Link>
          <form action={logoutAction}>
            <button className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white">
              登出
            </button>
          </form>
        </div>
      </header>

      <div className="space-y-4 px-6 py-5">
        {d.upcoming.length > 0 && (
          <div className="flex items-center justify-between border border-black bg-white px-4 py-2.5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4" style={{ color: ORANGE }} />
              <span className="text-[13px]">
                <span className="mr-2 border border-black bg-[#E4E3E0] px-1.5 py-0.5 text-[9px] uppercase tracking-wider f-mono">
                  待续费
                </span>
                {d.upcoming.length} 个订阅将在 30 天内到期，
                {d.upcoming[0].auto ? `${d.upcoming[0].name} 将于 ${d.upcoming[0].daysLeft} 天后自动扣费` : `${d.upcoming[0].name} 需手动续费`}
              </span>
            </div>
            <Link
              href="/subscriptions"
              className="text-[10px] uppercase tracking-wider underline underline-offset-2 f-mono"
            >
              查看全部 →
            </Link>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <Kpi index="A1" label="当日总日均" value={fmt(d.totalDailyCost)} sub={`≈ 每月 ${fmt(d.totalMonthlyCost)}`} led={ORANGE} />
          <Kpi index="A2" label="本月支出" value={fmt(d.monthSpent)} sub={`年度累计 ${fmt(d.yearSpent)}`} />
          <Kpi index="A3" label="活跃订阅" value={`${d.activeCount}`} sub={`物品 ${d.purchases.length} 件 · 日均 ${fmt(d.itemDailyCost)}`} />
          <Kpi index="A4" label="30 天日均" value={fmt(avg)} sub="近 30 天摊销均值" />
        </div>

        <Panel index="02" title="每日支出 / 30D">
          <div>
            <LedTrendChart data={d.trend} />
            <div className="mx-4 mb-3 mt-3 flex justify-between border-t border-dashed border-neutral-300 py-1.5 text-[9px] uppercase text-neutral-400 f-mono">
              <span>30 days ago</span>
              <span style={{ color: ORANGE }}>avg {fmt(avg)}/day</span>
              <span>today</span>
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-4">
          <Panel index="03" title="即将到期" action="全部" href="/subscriptions">            {d.upcoming.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
                未来 30 天没有到期订阅
              </div>
            )}
            {d.upcoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0">
                <div className="flex items-center gap-3">
                  <LedMatrix
                    rows={2}
                    cols={8}
                    size={4}
                    gap={2.5}
                    lit={(_, c) =>
                      c < Math.max(1, Math.min(8, 8 - Math.floor(u.daysLeft / 10)))
                        ? u.daysLeft <= 14
                          ? true
                          : "#111"
                        : false
                    }
                  />
                  <div>
                    <div className="text-[13px] font-medium">{u.name}</div>
                    <div className="text-[9px] uppercase tracking-wider text-neutral-400 f-mono">
                      {fmtDate(u.date)} · {u.auto ? "auto" : "manual"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums">
                    {u.amount != null ? fmt(u.amount) : "—"}
                  </span>
                  <span
                    className={`flex w-16 items-center justify-center gap-1 border px-1.5 py-0.5 text-[9px] uppercase f-mono ${u.daysLeft <= 7 ? "text-white" : "border-black bg-white"}`}
                    style={u.daysLeft <= 7 ? { background: ORANGE, borderColor: ORANGE } : {}}
                  >
                    {u.daysLeft <= 7 && <Led color="#fff" />}
                    {u.daysLeft}d left
                  </span>
                </div>
              </div>
            ))}
          </Panel>

          <Panel index="04" title="用量盈亏红黑榜" action="本区间">
            {d.usageBoard.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
                还没有配置用量追踪的订阅
              </div>
            )}
            {d.usageBoard.map((u) => (
              <a key={u.id} href={`/subscriptions/${u.id}`} className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0 hover:bg-black/[0.03]">
                <div>
                  <div className="text-[13px] font-medium">{u.name}</div>
                  <div className="text-[9px] text-neutral-400 f-mono">{u.detail}</div>
                </div>
                <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums f-mono">
                  {u.verdictAmount >= 0 ? "+" : "−"}{fmt(Math.abs(u.verdictAmount))}
                  <Led color={u.verdictAmount >= 0 ? "#22c55e" : "#ef4444"} />
                </span>
              </a>
            ))}
          </Panel>
        </div>

        <Panel index="05" title="物品回本进度" action="物品" href="/purchases">
          {d.purchases.length === 0 && (
            <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
              还没有登记物品
            </div>
          )}
          <div className="grid grid-cols-3 gap-px bg-white">
            {d.purchases.map((p) => (
              <a key={p.id} href={`/purchases/${p.id}`} className="block border border-neutral-200 bg-white px-4 py-3 hover:bg-black/[0.03]">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium">{p.name}</span>
                  <span className="text-[9px] uppercase text-neutral-400 f-mono">
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
              </a>
            ))}
          </div>
        </Panel>

        <Panel index="06" title="订阅明细" action="管理" href="/subscriptions">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-black text-left text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">分类</th>
                <th className="px-4 py-2 font-medium">周期</th>
                <th className="px-4 py-2 font-medium">到期日</th>
                <th className="px-4 py-2 text-right font-medium">日均</th>
                <th className="px-4 py-2 text-right font-medium">月均</th>
                <th className="px-4 py-2 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((s) => (
                <tr key={s.id} className="border-b border-neutral-200 last:border-0 hover:bg-black/[0.03]">
                  <td className="px-4 py-2.5">
                    <Link href={`/subscriptions/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500">{s.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[11px] text-neutral-500 f-mono">{s.cycleLabel}</td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-neutral-500 f-mono">
                    {s.expiry ? fmtDate(s.expiry) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11px] font-semibold tabular-nums f-mono">{fmt(s.dailyCost)}</td>
                  <td className="px-4 py-2.5 text-right text-[11px] tabular-nums text-neutral-500 f-mono">{fmt(s.monthlyCost)}</td>
                  <td className="px-4 py-2.5">
                    {s.status === "CANCELLED" ? (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono">
                        <Led color="#ef4444" /> 已取消
                      </span>
                    ) : s.daysUntilExpiry !== null && s.daysUntilExpiry <= 14 ? (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase text-white f-mono" style={{ background: ORANGE }}>
                        <Led color="#fff" /> {s.daysUntilExpiry}d
                      </span>
                    ) : (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono">
                        <Led color="#22c55e" /> ok
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {d.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[11px] uppercase text-neutral-400 f-mono">
                    还没有订阅，点右上角「新建订阅」开始
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
