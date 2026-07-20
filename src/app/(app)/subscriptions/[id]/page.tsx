import { notFound } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { Kpi, Panel, fmt, fmtDate } from "@/components/te";
import { getCurrentUser } from "@/lib/auth/session";
import { costSegments, currentDailyRate, currentExpiry, dayDiff } from "@/lib/cost-engine";
import {
  getSubscription,
  paymentPrefill,
  planRechain,
  toEnginePayments,
  toEngineSub,
} from "@/lib/subscriptions/service";
import { setStatusAction } from "@/lib/subscriptions/actions";
import { RechainBanner } from "./RechainBanner";
import {
  beneficiaryRows as serviceBeneficiaryRows,
  listBeneficiaryCandidates,
  shareForViewer,
} from "@/lib/beneficiaries/service";
import { getUsageVerdict, listUsage } from "@/lib/usage/service";
import { PaymentForm } from "./PaymentForm";
import { PaymentHistory, type HistoryPayment } from "./PaymentHistory";
import { BeneficiariesPanel, type BeneficiaryRow } from "./BeneficiariesPanel";
import {
  UsageEntryPanel,
  UsageVerdictPanel,
  type UsageRecordRow,
  type VerdictData,
} from "./UsagePanel";

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rechain?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = (await getCurrentUser())!;
  const sub = await getSubscription(user.id, id);
  if (!sub) notFound();

  const today = new Date();
  const engineSub = toEngineSub(sub);
  const payments = toEnginePayments(sub.payments);
  const expiry = currentExpiry(engineSub, payments, today);
  const daily = currentDailyRate(engineSub, payments, today);
  const covering = costSegments(engineSub, payments, today).filter(
    (s) => s.start <= today && today < s.end,
  );
  const coveringUnknown = covering.some((s) => s.amountUnknown === true);
  // 覆盖今天的只有推算段（记录止期已过）→ 费率是标准价估计，不是实付
  const coveringEstimated = covering.length > 0 && covering.every((s) => s.estimated);
  const daysToExpiry = expiry ? dayDiff(today, expiry) : null;
  // 推算段（未记账）：最后记录止期之后的 estimated 段，在付费历史底部强区分展示
  const lastRecordedEnd = sub.payments.length > 0
    ? sub.payments.reduce((max, p) => (p.periodEnd > max ? p.periodEnd : max), sub.payments[0].periodEnd)
    : null;
  const estimatedRows = costSegments(engineSub, payments, today)
    .filter((seg) => seg.estimated && (lastRecordedEnd === null || seg.start >= lastRecordedEnd))
    .map((seg) => ({
      start: isoDay(seg.start),
      end: isoDay(seg.end),
      net: seg.net,
    }));
  const totalPaid = sub.payments.reduce((s, p) => s + (p.amountBase ?? 0) - p.refundedBase, 0);
  const unknownPayments = sub.payments.filter((p) => p.amountBase === null).length;
  const prefillRaw = paymentPrefill(sub, sub.payments);
  const iso = (d: Date) => isoDay(d);
  const prefill = {
    paidAt: iso(today),
    periodStart: iso(prefillRaw.periodStart),
    periodEnd: iso(prefillRaw.periodEnd),
    amount: prefillRaw.amountBase,
    currency: sub.listCurrency ?? "CNY",
  };

  const usageRecords = sub.usageKind ? await listUsage(sub.id) : [];
  // 分摊（ADR-0003）：我的份额与按人盈亏
  const isOwner = sub.ownerId === user.id;
  const myShare = shareForViewer(sub.beneficiaries, sub.ownerId, user.id);
  const beneficiaryRows = serviceBeneficiaryRows(sub);
  const { users: candidateUsers, items: candidateItems } = isOwner
    ? await listBeneficiaryCandidates(user.id, sub.id)
    : { users: [], items: [] };
  // 用量与盈亏按人切片：录入/日历/继承只看我的记录
  const myUsageRecords = usageRecords.filter((r) => r.userId === user.id);
  const v = sub.usageKind ? getUsageVerdict(sub, usageRecords, today, user.id) : null;
  // 所有者视角：各受益人对比（谁在用、谁纯亏）
  const perUserVerdicts: { name: string; usageLabel: string; verdictAmount: number }[] =
    isOwner && sub.usageKind && sub.beneficiaries.length > 0
      ? sub.beneficiaries
          .filter((b) => b.kind === "USER")
          .map((b) => {
            const pv = getUsageVerdict(sub, usageRecords, today, b.userId!);
            if (!pv) return null;
            return {
              name: b.user?.username ?? "?",
              usageLabel:
                pv.kind === "COUNT"
                  ? `${pv.usage} ${sub.usageUnit ?? ""}`
                  : `${Math.round(pv.usageRate * 100)}%`,
              verdictAmount: pv.verdictAmount,
            };
          })
          .filter((x) => x !== null)
      : [];
  const usageRecordRows: UsageRecordRow[] = myUsageRecords.map((r) => ({
    id: r.id,
    date: isoDay(r.date),
    quantity: r.quantity,
    kind: r.kind,
    unitPrice: r.unitPrice,
    quotaTotal: r.quotaTotal,
  }));
  const verdictData: VerdictData | null = v
    ? v.kind === "COUNT"
      ? {
          kind: "COUNT",
          periodStart: iso(v.periodStart),
          periodEnd: iso(v.periodEnd),
          cost: v.cost,
          usage: v.usage,
          value: v.value,
          verdictAmount: v.verdictAmount,
          costPerUse: v.costPerUse,
          costUnknown: v.costUnknown,
        }
      : {
          kind: "QUOTA",
          periodStart: iso(v.periodStart),
          periodEnd: iso(v.periodEnd),
          cost: v.cost,
          used: v.used,
          total: v.total,
          usageRate: v.usageRate,
          hit100At: v.hit100At ? iso(v.hit100At) : null,
          wastedAmount: v.wastedAmount,
          costPerUnit: v.costPerUnit,
          verdictAmount: v.verdictAmount,
          costUnknown: v.costUnknown,
        }
    : null;

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
          {isOwner && (
            <a
              href={`/subscriptions/${sub.id}/edit`}
              className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white"
            >
              编辑 →
            </a>
          )}
          <a
            href={`/subscriptions/${sub.id}/usage`}
            className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white"
          >
            用量跟踪{sub.usageKind ? "" : "（未启用）"} →
          </a>
          {isOwner && (sub.status === "ACTIVE" ? (
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
          ))}
          {isOwner && (
            <form action={setStatusAction.bind(null, sub.id, "ARCHIVED")}>
              <button className="border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 f-mono hover:bg-black hover:text-white">
                归档
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="space-y-4 px-6 py-5">
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
            />
          );
        })()}
        <div className="grid grid-cols-4 gap-4">
          <Kpi
            index="B1"
            label="当前到期日"
            value={expiry ? fmtDate(expiry) : "—"}
            sub={
              expiry
                ? daysToExpiry! < 0
                  ? `已过期 ${-daysToExpiry!} 天（到期日当天起不再覆盖）`
                  : `${daysToExpiry} 天后（当天起不再覆盖）`
                : "手动模式待记录"
            }
            led={daysToExpiry !== null && daysToExpiry < 0 ? "#ef4444" : undefined}
          />
          <Kpi
            index="B2"
            label="当日费率"
            value={daily === 0 && coveringUnknown ? "未知" : fmt(daily)}
            sub={
              daily === 0 && coveringUnknown
                ? "当前区间金额未记录，成本不计"
                : coveringEstimated
                  ? "按标准价推算中（未记账，记一笔后按实付修正）"
                  : sub.beneficiaries.length > 0
                  ? `我的份额 ${Math.round(myShare * 100)}% · ${fmt(daily * myShare)}/日`
                  : `≈ 每月 ${fmt(daily * 30.4)}`
            }
          />
          <Kpi index="B3" label="累计实付" value={fmt(totalPaid)} sub={`${sub.payments.length} 笔付费记录${unknownPayments > 0 ? ` · ${unknownPayments} 笔金额未知` : ""}`} />
          <Kpi
            index="B4"
            label="状态"
            value={
              sub.status === "ARCHIVED"
                ? "已归档"
                : sub.status === "CANCELLED"
                  ? "已取消"
                  : coveringEstimated
                    ? "推算中"
                    : daysToExpiry !== null && daysToExpiry < 0
                      ? "已到期"
                      : "活跃"
            }
            sub={
              sub.status !== "ACTIVE"
                ? sub.autoRenew
                  ? "自动续费"
                  : "手动续费"
                : coveringEstimated
                  ? "活跃 · 未记账，按标准价估计"
                  : daysToExpiry !== null && daysToExpiry < 0
                    ? "记录续费后恢复活跃"
                    : sub.autoRenew
                      ? "自动续费"
                      : "手动续费"
            }
            led={
              sub.status !== "ACTIVE"
                ? "#ef4444"
                : coveringEstimated
                  ? "#FF6B00"
                  : daysToExpiry !== null && daysToExpiry < 0
                    ? "#d4d4d4"
                    : "#22c55e"
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {isOwner ? (
            <Panel index="01" title="记一笔付费">
              <PaymentForm subscriptionId={sub.id} prefill={prefill} />
            </Panel>
          ) : (
            <Panel index="01" title="共享订阅">
              <div className="px-4 py-6 text-[11px] leading-relaxed text-neutral-500">
                这是 <span className="font-semibold text-black">{sub.owner.username}</span> 共享给你的订阅。
                你按份额承担成本，用量各自记录；付费与配置由所有者管理。
              </div>
            </Panel>
          )}

          <Panel
            index="02"
            title={`付费历史 / ${sub.payments.length}`}
            actions={
              <a href={`/subscriptions/${sub.id}/payments`} className="text-[10px] uppercase tracking-wider text-neutral-500 f-mono hover:text-black">
                全部 →
              </a>
            }
          >
            <PaymentHistory
              subscriptionId={sub.id}
              canEdit={isOwner}
              estimatedRows={estimatedRows}
              payments={[...sub.payments].reverse().map((p): HistoryPayment => ({
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
              }))}
            />
          </Panel>
        </div>

        {sub.usageKind && (
          <div className="grid grid-cols-2 gap-4">
            <Panel
              index="03"
              title={`用量录入${sub.script ? " · 脚本同步中" : ""}`}
              actions={
                sub.script ? (
                  <a href="/settings/scripts" className="text-[10px] uppercase tracking-wider text-neutral-500 f-mono hover:text-black">
                    脚本管理 →
                  </a>
                ) : undefined
              }
            >
              <UsageEntryPanel
                subscriptionId={sub.id}
                usageKind={(sub.usageKind as "COUNT" | "QUOTA" | null) ?? null}
                usageUnit={sub.usageUnit}
                defaultUnitPrice={sub.altUnitPrice}
                defaultQuotaTotal={sub.quotaTotal}
                records={usageRecordRows}
                verdict={verdictData}
              />
            </Panel>
            <Panel
              index="04"
              title="盈亏 · 当前区间"
              actions={
                <a href={`/subscriptions/${sub.id}/usage/records`} className="text-[10px] uppercase tracking-wider text-neutral-500 f-mono hover:text-black">
                  全部 →
                </a>
              }
            >
              <UsageVerdictPanel
                verdict={verdictData}
                usageUnit={sub.usageUnit}
                subscriptionId={sub.id}
                records={usageRecordRows}
                perUser={perUserVerdicts}
              />
            </Panel>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4">
          <Panel index="05" title="受益实体 / 分摊">
            <BeneficiariesPanel
              subscriptionId={sub.id}
              isOwner={isOwner}
              rows={beneficiaryRows}
              candidateUsers={candidateUsers}
              candidateItems={candidateItems}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
