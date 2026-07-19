// Dashboard 数据装配：从仓储取数 → 成本引擎计算 → 页面视图模型。

import {
  costSegments,
  currentDailyRate,
  currentExpiry,
  dayDiff,
  purchaseCurrentDailyRate,
  segmentDailyRate,
  breakevenProgress,
} from "./cost-engine";
import {
  listSubscriptions,
  toEnginePayments,
  toEngineSub,
  type SubscriptionWithPayments,
} from "./subscriptions/service";
import { listPurchases, toEnginePurchase } from "./purchases/service";
import { getUsageVerdict, listUsage } from "./usage/service";
import { shareFor } from "./beneficiaries/service";

export interface DashboardRow {
  id: string;
  name: string;
  category: string | null;
  cycleLabel: string;
  expiry: Date | null;
  daysUntilExpiry: number | null;
  dailyCost: number;
  monthlyCost: number;
  status: string;
  /** 共享订阅（非我拥有）：标注所有者 */
  sharedFrom: string | null;
  /** 我的份额（0–1；无分摊为 1） */
  sharePct: number;
}

export interface UpcomingItem {
  id: string;
  name: string;
  date: Date;
  daysLeft: number;
  amount: number | null;
  auto: boolean;
}

export interface PurchaseRow {
  id: string;
  name: string;
  daysHeld: number;
  dailyCost: number;
  progress: number | undefined;
  amountBase: number;
  status: string;
}

export interface UsageBoardRow {
  id: string;
  name: string;
  detail: string;
  verdictAmount: number;
}

export interface DashboardData {
  totalDailyCost: number;
  totalMonthlyCost: number;
  monthSpent: number;
  yearSpent: number;
  activeCount: number;
  rows: DashboardRow[];
  upcoming: UpcomingItem[];
  purchases: PurchaseRow[];
  usageBoard: UsageBoardRow[];
  itemDailyCost: number;
  trend: number[];
}

const CYCLE_LABEL: Record<string, string> = {
  DAY: "日付",
  WEEK: "周付",
  MONTH: "月付",
  YEAR: "年付",
};

function cycleLabel(sub: SubscriptionWithPayments): string {
  if (sub.trackingMode !== "CYCLE") return "手动";
  if (sub.cycleKind === "FIXED_DAYS") return `每 ${sub.fixedDays} 天`;
  const unit = CYCLE_LABEL[sub.cycleUnit ?? ""] ?? "";
  return sub.cycleCount && sub.cycleCount > 1 ? `每 ${sub.cycleCount} ${unit.replace("付", "")}` : unit;
}

/** 某订阅在 date 当天的摊销费率（覆盖段求和，无覆盖为 0） */
function rateOn(sub: SubscriptionWithPayments, date: Date): number {
  return costSegments(toEngineSub(sub), toEnginePayments(sub.payments), date)
    .filter((s) => dayDiff(s.start, date) >= 0 && dayDiff(date, s.end) > 0)
    .reduce((sum, s) => sum + segmentDailyRate(s), 0);
}

const atUtcMidnight = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const subs = await listSubscriptions(userId);
  const purchasesRaw = await listPurchases(userId);
  const today = atUtcMidnight(new Date());

  const rows: DashboardRow[] = subs.map((sub) => {
    const engineSub = toEngineSub(sub);
    const payments = toEnginePayments(sub.payments);
    const expiry = currentExpiry(engineSub, payments, today);
    // 份额切片（ADR-0003）：共享订阅只计我的份额
    const share = shareFor(sub.beneficiaries, sub.ownerId, userId);
    const daily = currentDailyRate(engineSub, payments, today) * share;
    return {
      id: sub.id,
      name: sub.name,
      category: sub.category,
      cycleLabel: cycleLabel(sub),
      expiry,
      daysUntilExpiry: expiry ? dayDiff(today, expiry) : null,
      dailyCost: daily,
      monthlyCost: daily * 30.4,
      status: sub.status,
      sharedFrom: sub.ownerId === userId ? null : sub.owner.username,
      sharePct: share,
    };
  });

  const active = rows.filter((r) => r.status === "ACTIVE");
  const purchases: PurchaseRow[] = purchasesRaw.map((p) => {
    const engine = toEnginePurchase(p);
    return {
      id: p.id,
      name: p.name,
      daysHeld: dayDiff(p.purchaseDate, today),
      dailyCost: purchaseCurrentDailyRate(engine, today),
      progress: breakevenProgress(engine, today),
      amountBase: p.amountBase,
      status: p.status,
    };
  });
  const itemDailyCost = purchases.reduce((s, p) => s + p.dailyCost, 0);
  const totalDailyCost = active.reduce((s, r) => s + r.dailyCost, 0) + itemDailyCost;

  // 用量红黑榜：启用用量追踪的订阅按当前区间盈亏排序（按人切片，ADR-0003）
  const usageBoard: UsageBoardRow[] = [];
  for (const sub of subs.filter((s) => s.usageKind)) {
    const v = getUsageVerdict(sub, await listUsage(sub.id), today, userId);
    if (!v) continue;
    usageBoard.push({
      id: sub.id,
      name: sub.name,
      detail:
        v.kind === "COUNT"
          ? `${v.usage} ${sub.usageUnit ?? ""} × ${v.value > 0 && v.usage > 0 ? (v.value / v.usage).toFixed(2) : sub.altUnitPrice} − ${v.cost.toFixed(2)}`
          : `已用 ${Math.round(v.usageRate * 100)}%（${v.used}/${v.total} ${sub.usageUnit ?? ""}）${v.hit100At ? " · 已用满" : ""}`,
      verdictAmount: v.verdictAmount,
    });
  }
  usageBoard.sort((a, b) => b.verdictAmount - a.verdictAmount);

  const upcoming: UpcomingItem[] = subs
    .filter((s) => s.status === "ACTIVE")
    .map((sub): UpcomingItem | null => {
      const expiry = currentExpiry(toEngineSub(sub), toEnginePayments(sub.payments), today);
      if (!expiry) return null;
      const daysLeft = dayDiff(today, expiry);
      if (daysLeft < 0 || daysLeft > 30) return null;
      const lastPayment = sub.payments[sub.payments.length - 1];
      return {
        id: sub.id,
        name: sub.name,
        date: expiry,
        daysLeft,
        amount: sub.listPriceBase ?? lastPayment?.amountBase ?? null,
        auto: sub.autoRenew,
      };
    })
    .filter((u) => u !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const trend: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86_400_000);
    const subCost = subs
      .filter((s) => s.status === "ACTIVE" && dayDiff(s.startDate, day) >= 0)
      .reduce((sum, s) => sum + rateOn(s, day) * shareFor(s.beneficiaries, s.ownerId, userId), 0);
    const itemCost = purchasesRaw
      .filter((p) => dayDiff(p.purchaseDate, day) >= 0)
      .reduce((sum, p) => sum + purchaseCurrentDailyRate(toEnginePurchase(p), day), 0);
    trend.push(subCost + itemCost);
  }

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  // 实付只计自己拥有的订阅（共享订阅的钱是所有者出的）
  const spent = subs.filter((s) => s.ownerId === userId).flatMap((s) => s.payments);
  const monthSpent = spent
    .filter((p) => p.paidAt >= monthStart)
    .reduce((s, p) => s + p.amountBase - p.refundedBase, 0);
  const yearSpent = spent
    .filter((p) => p.paidAt >= yearStart)
    .reduce((s, p) => s + p.amountBase - p.refundedBase, 0);

  return {
    totalDailyCost,
    totalMonthlyCost: totalDailyCost * 30.4,
    monthSpent,
    yearSpent,
    activeCount: active.length,
    rows,
    upcoming,
    purchases,
    usageBoard,
    itemDailyCost,
    trend,
  };
}
