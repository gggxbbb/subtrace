import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBanner, Kpi, Led, LedMatrix, ORANGE, Panel } from "@/components/te";
import { LedTrendChart } from "@/components/LedTrendChart";
import { UsageEntryHub } from "@/components/UsageEntryHub";
import { DigestBanner } from "@/components/DigestBanner";
import { isoDay } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import { llmConfigured } from "@/lib/digest/llm";
import { buildDigestPayload, digestFingerprint } from "@/lib/digest/payload";
import { logoutAction } from "@/lib/auth/actions";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const cur = user.baseCurrency;
  const d = await getDashboardData(user.id);
  const avg = d.trend.reduce((s, v) => s + v, 0) / d.trend.length;
  // 录入台常驻（usage-shell ticket 01）：面板编号固定，不再随窄条显隐前移
  // AI 摘要 banner（ADR-0016）：配 LLM 且有到期项时先查指纹缓存，命中非 failed 直出摘要文案
  let banner:
    | { mode: "digest"; line: string; detail: string }
    | { mode: "template"; text: string; enabled: boolean }
    | null = null;
  if (d.upcoming.length > 0) {
    const templateText = `${d.upcoming.length} 个订阅将在 30 天内到期，${
      d.upcoming[0].auto
        ? `${d.upcoming[0].name} 将于 ${d.upcoming[0].daysLeft} 天后自动扣费`
        : `${d.upcoming[0].name} 需手动续费`
    }`;
    const enabled = llmConfigured();
    banner = { mode: "template", text: templateText, enabled };
    if (enabled) {
      const fingerprint = digestFingerprint(buildDigestPayload(d), user.id);
      const cached = await prisma.digestCache.findUnique({ where: { fingerprint } });
      if (cached && !cached.failed) {
        banner = { mode: "digest", line: cached.line, detail: cached.detail };
      }
    }
  }

  return (
    <>
      <PageHeader
        crumb={<>01 / overview</>}
        title={<>控制台</>}
        actions={
          <>
            <Link
              href="/subscriptions/new"
              className="flex items-center gap-1.5 bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> 新建订阅
            </Link>
            <form action={logoutAction}>
              <button className="border border-ink bg-surface px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-ink hover:text-surface">
                登出
              </button>
            </form>
          </>
        }
      />

      <div className="space-y-4 px-4 py-5 md:px-6">
        <ErrorBanner error={error ?? null} defaultMessage="记录失败：请重试" />
        {banner && <DigestBanner initial={banner} />}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Kpi index="A1" label="当日总日均" value={fmtMoney(d.totalDailyCost, cur)} sub={`订阅 ${fmtMoney(d.subDailyCost, cur)} · 物品 ${fmtMoney(d.itemDailyCost, cur)}`} title={`≈ 每月 ${fmtMoney(d.totalMonthlyCost, cur)}`} led={ORANGE} />
          <Kpi index="A2" label="本月支出" value={fmtMoney(d.monthSpent, cur)} sub={`年度累计 ${fmtMoney(d.yearSpent, cur)}`} />
          <Kpi index="A3" label="活跃订阅" value={`${d.activeCount}`} sub={`自动续费 ${d.rows.filter((r) => r.status === "ACTIVE" && r.autoRenew).length} · 手动 ${d.rows.filter((r) => r.status === "ACTIVE" && !r.autoRenew).length}`} />
          <Kpi index="A4" label="30 天日均" value={fmtMoney(avg, cur)} sub="近 30 天摊销均值" />
        </div>

        <Panel index="02" title="记用量">
          <UsageEntryHub rows={d.entryRows} todayIso={isoDay(new Date())} />
        </Panel>

        <Panel index="03" title="每日支出 / 30D">
          <div>
            <LedTrendChart data={d.trend} />
            <div className="mx-4 mb-3 mt-3 flex justify-between border-t border-dashed border-line-strong py-1.5 text-[9px] uppercase text-faint f-mono">
              <span>30 days ago</span>
              <span style={{ color: ORANGE }}>avg {fmtMoney(avg, cur)}/day</span>
              <span>today</span>
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <Panel index="04" title="即将到期" action="全部" href="/subscriptions?sort=expiry&dir=asc">            {d.upcoming.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] uppercase text-faint f-mono">
                未来 30 天没有到期订阅
              </div>
            )}
            {d.upcoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0">
                <div className="flex min-w-0 items-center gap-3">
                  <LedMatrix
                    rows={2}
                    cols={8}
                    size={4}
                    gap={2.5}
                    lit={(_, c) =>
                      c < Math.max(1, Math.min(8, 8 - Math.floor(u.daysLeft / 10)))
                        ? u.daysLeft <= 14
                          ? true
                          : "var(--ink)"
                        : false
                    }
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium" title={u.name}>{u.name}</div>
                    <div className="text-[9px] uppercase tracking-wider text-faint f-mono">
                      {isoDay(u.date)} · {u.auto ? "auto" : "manual"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-bold tabular-nums">
                    {u.amount != null ? fmtMoney(u.amount, cur) : "—"}
                  </span>
                  <span
                    className={`flex w-16 items-center justify-center gap-1 border px-1.5 py-0.5 text-[9px] uppercase f-mono ${u.daysLeft <= 7 ? "text-surface" : "border-ink bg-surface"}`}
                    style={u.daysLeft <= 7 ? { background: ORANGE, borderColor: ORANGE } : {}}
                  >
                    {u.daysLeft <= 7 && <Led color="#fff" />}
                    {u.daysLeft}d left
                  </span>
                </div>
              </div>
            ))}
          </Panel>

          <Panel index="05" title="用量盈亏红黑榜" action="近30天">
            {d.usageBoard.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] uppercase text-faint f-mono">
                还没有配置用量追踪的订阅
              </div>
            )}
            {d.usageBoard.map((u) => (
              <a key={u.id} href={`/subscriptions/${u.id}`} className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-0 hover:bg-black/[0.03]">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium" title={u.name}>{u.name}</div>
                  <div className="truncate text-[9px] text-faint f-mono">
                    <span className="text-muted">{u.windowLabel}</span>
                    {u.quantityLabel && ` · ${u.quantityLabel}`}
                    {` · 付了 ${fmtMoney(u.paid, cur)} · 用回 `}
                    {u.valueUnknown ? <span className="text-faint">价值未知</span> : fmtMoney(u.value, cur)}
                    {u.valuePartial && <span className="text-faint">（仅计有单价部分）</span>}
                    {u.stale && <span className="font-bold text-destructive"> · 快照陈旧</span>}
                  </div>
                  {(u.countdown || u.wasteNote) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] f-mono">
                      {u.countdown && (
                        <span className="border border-line-strong px-1 py-px text-muted">{u.countdown}</span>
                      )}
                      {u.wasteNote && <span className="text-destructive">{u.wasteNote}</span>}
                    </div>
                  )}
                </div>
                {u.costUnknown ? (
                  <span className="shrink-0 text-sm font-bold text-faint f-mono">成本未知</span>
                ) : u.valueUnknown ? (
                  <span className="shrink-0 text-sm font-bold text-faint f-mono">价值未知</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tabular-nums f-mono">
                    {u.verdictAmount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(u.verdictAmount), cur)}
                    <Led color={u.verdictAmount >= 0 ? "#22c55e" : "#ef4444"} />
                  </span>
                )}
              </a>
            ))}
          </Panel>
        </div>

        <Panel index="06" title="物品回本进度" action="物品" href="/purchases">
          {d.purchases.length === 0 && (
            <div className="px-4 py-6 text-center text-[11px] uppercase text-faint f-mono">
              还没有登记物品
            </div>
          )}
          <div className="grid grid-cols-1 gap-px bg-surface sm:grid-cols-2 lg:grid-cols-3">
            {d.purchases.map((p) => (
              <a key={p.id} href={`/purchases/${p.id}`} className="block border border-line bg-surface px-4 py-3 hover:bg-black/[0.03]">
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
              </a>
            ))}
          </div>
        </Panel>

        <Panel index="07" title="订阅明细" action="管理" href="/subscriptions">
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
                <th className="px-4 py-2 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-black/[0.03]">
                  <td className="px-4 py-2.5">
                    <Link href={`/subscriptions/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    {s.sharedFrom && (
                      <span className="ml-1.5 border border-sky-700 px-1 py-px text-[9px] uppercase text-sky-700 f-mono">
                        共享·{s.sharedFrom}
                      </span>
                    )}
                    {!s.sharedFrom && s.sharePct < 1 && (
                      <span className="ml-1.5 border border-orange-600 px-1 py-px text-[9px] uppercase text-orange-600 f-mono">
                        分摊 {Math.round(s.sharePct * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{s.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[11px] text-muted f-mono">{s.cycleLabel}</td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-muted f-mono">
                    {s.expiry ? isoDay(s.expiry) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11px] font-semibold tabular-nums f-mono">
                    {s.costUnknown && s.dailyCost === 0 ? (
                      <span className="text-faint">未知</span>
                    ) : (
                      fmtMoney(s.dailyCost, cur)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[11px] tabular-nums text-muted f-mono">
                    {s.costUnknown && s.dailyCost === 0 ? "—" : fmtMoney(s.monthlyCost, cur)}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.status === "CANCELLED" ? (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase f-mono">
                        <Led color="#ef4444" /> 已取消
                      </span>
                    ) : s.daysUntilExpiry !== null && s.daysUntilExpiry < 0 ? (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase text-white f-mono" style={{ background: "#ef4444" }}>
                        <Led color="#fff" /> 过期 {-s.daysUntilExpiry}d
                      </span>
                    ) : s.daysUntilExpiry !== null && s.daysUntilExpiry <= 14 ? (
                      <span className="flex w-fit items-center gap-1.5 px-1.5 py-0.5 text-[9px] uppercase text-surface f-mono" style={{ background: ORANGE }}>
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
                  <td colSpan={7} className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
                    还没有订阅，点右上角「新建订阅」开始
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
