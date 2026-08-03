// Dashboard 数据装配：从仓储取数 → 成本视图（cost-view）→ 页面视图模型。

import { breakevenProgress, dayDiff, purchaseCurrentDailyRate } from "./cost-engine";
import {
  listSubscriptions,
  type SubscriptionWithPayments,
} from "./subscriptions/service";
import { costOverPeriod, costView, paidInPeriod } from "./subscriptions/cost-view";
import { DAY_MS, dayStart, fromWall, wallParts } from "./dates";
import { listPurchases, toEnginePurchase } from "./purchases/service";
import { getUsageVerdict, listUsage } from "./usage/service";

export interface DashboardRow {
  id: string;
  name: string;
  category: string | null;
  /** 当前覆盖段金额未知（ticket 12）：费率为 0，UI 标「未知」而非 ¥0 */
  costUnknown: boolean;
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
  /** 覆盖段金额未知（ticket 12）：盈亏不可信，UI 灰显 */
  costUnknown?: boolean;
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

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const subs = await listSubscriptions(userId);
  const purchasesRaw = await listPurchases(userId);
  const today = dayStart(new Date());
  // 每订阅一次点视图（成本段只算一遍，行/到期/趋势共用）
  const views = new Map(subs.map((s) => [s.id, costView(s, userId, today)]));

  const rows: DashboardRow[] = subs.map((sub) => {
    const v = views.get(sub.id)!;
    return {
      id: sub.id,
      name: sub.name,
      category: sub.category,
      costUnknown: v.costUnknown,
      cycleLabel: cycleLabel(sub),
      expiry: v.expiry,
      daysUntilExpiry: v.expiry ? dayDiff(today, v.expiry) : null,
      dailyCost: v.myDailyRate,
      monthlyCost: v.myDailyRate * 30.4,
      status: sub.status,
      sharedFrom: sub.ownerId === userId ? null : sub.owner.username,
      sharePct: v.share,
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

  // 用量红黑榜：启用用量追踪的订阅按当前区间盈亏排序（按人切片，ADR-0003）；用量并行拉取
  const usageBoard: UsageBoardRow[] = (
    await Promise.all(
      subs
        .filter((s) => s.usageKind)
        .map(async (sub) => {
          const v = getUsageVerdict(sub, await listUsage(sub.id), today, userId);
          if (!v) return null;
          return {
            id: sub.id,
            name: sub.name,
            detail:
              v.kind === "COUNT"
                ? `${v.usage} ${sub.usageUnit ?? ""} × ${v.value > 0 && v.usage > 0 ? (v.value / v.usage).toFixed(2) : sub.altUnitPrice} − ${v.cost.toFixed(2)}`
                : v.kind === "SAVINGS"
                  ? `已省 ${v.saved.toFixed(2)} − 成本 ${v.cost.toFixed(2)}`
                  : v.kind === "PACK"
                    ? `余额 ${v.balance} ${sub.usageUnit ?? ""} · 区间浪费 ${v.periodWaste.amount.toFixed(2)}${v.staleDays != null && v.staleDays >= 30 ? " · 快照陈旧" : ""}`
                    : `已用 ${Math.round(v.usageRate * 100)}%（${v.used}/${v.total} ${sub.usageUnit ?? ""}）${v.hit100At ? " · 已用满" : ""}`,
            verdictAmount: v.verdictAmount,
            costUnknown: v.costUnknown,
          };
        }),
    )
  )
    .filter((r) => r !== null)
    .sort((a, b) => b.verdictAmount - a.verdictAmount);

  const upcoming: UpcomingItem[] = subs
    .filter((s) => s.status === "ACTIVE")
    .map((sub): UpcomingItem | null => {
      const expiry = views.get(sub.id)!.expiry;
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

  // 近 30 天每日摊销：区间视图段算一次按天切片（30×N → N 次分段）。
  // 持有期口径（与报表/costOverPeriod 统一）：已卖出/报废物品在 [购买日, 截止日) 内照摊，
  // 历史趋势不被卖出动作回溯改写（2026-07-29 评审后决策，cost-assembly US7 例外注记）。
  const trend = costOverPeriod({
    subs: subs.filter((s) => s.status === "ACTIVE"),
    purchases: purchasesRaw,
    viewerId: userId,
    startMs: today.getTime() - 29 * DAY_MS,
    endMs: today.getTime() + DAY_MS,
  }).days.map((day) => day.cost);

  const tp = wallParts(today);
  const monthStart = fromWall(tp.year, tp.month, 1);
  const yearStart = fromWall(tp.year, 0, 1);
  // 实付只计自己拥有的订阅（共享订阅的钱是所有者出的）
  const spent = subs.filter((s) => s.ownerId === userId).flatMap((s) => s.payments);
  const tomorrowMs = today.getTime() + DAY_MS;
  const monthSpent = paidInPeriod(spent, monthStart.getTime(), tomorrowMs);
  const yearSpent = paidInPeriod(spent, yearStart.getTime(), tomorrowMs);

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
