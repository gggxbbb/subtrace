// Dashboard 数据装配：从仓储取数 → 成本视图（cost-view）→ 页面视图模型。

import { breakevenProgress, dayDiff, purchaseCurrentDailyRate } from "./cost-engine";
import {
  listSubscriptions,
  type SubscriptionWithPayments,
} from "./subscriptions/service";
import { costOverPeriod, costView, paidInPeriod } from "./subscriptions/cost-view";
import { DAY_MS, dayStart, fromWall, wallParts, isoDay } from "./dates";
import { listPurchases, toEnginePurchase } from "./purchases/service";
import { getRollingVerdict, getUsageVerdict, listPacks, listUsage, reconcileAutoPacks, type UsageVerdict } from "./usage/service";
import type { RollingVerdict } from "./usage/rolling";
import { loggedToday } from "./usage/pending";
import type { UsageRecord } from "@/generated/prisma/client";
import { usageTuples, type UsageTuple } from "./usage/tuples";

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
  /** 窗口标签（ADR-0014）：近30天；启用不足 30 天为实际天数（「近12天」） */
  windowLabel: string;
  /** 口径数量描述：COUNT「12 次」/ QUOTA「消耗 45 GB」/ SAVINGS 为 null */
  quantityLabel: string | null;
  /** 窗口内摊销成本（付了，我的份额口径） */
  paid: number;
  /** 窗口内用回价值（用回；SAVINGS = 已省金额） */
  value: number;
  /** 近 30 天净盈亏（用回 − 付了） */
  verdictAmount: number;
  /** 覆盖段金额未知（ticket 12）：盈亏不可信，UI 灰显 */
  costUnknown?: boolean;
  /** COUNT 窗口内全部记录无单价（ticket 04）：净盈亏不出数，灰显「价值未知」，次数与成本照常 */
  valueUnknown?: boolean;
  /** COUNT 窗口内部分记录无单价（ticket 04）：价值仅按有单价部分估值，UI 标注口径 */
  valuePartial?: boolean;
  /** 快照陈旧 ≥30 天（STACKED，story 12）：大盘原位变色提示 */
  stale?: boolean;
  /** 倒计时 chip（周期事实降级为附属信号）：RESET「距重置 N 天 · 本周期已用 P%」；
   *  STACKED「M月D日到期 N 单位 · 预计剩 M」 */
  countdown?: string;
  /** 窗口内浪费事件标注（STACKED）：「9月1日到期焚毁 2GB」 */
  wasteNote?: string;
}

/** 「记用量」录入台行（usage-shell ticket 01）：全部口径的活跃跟踪订阅平铺，日均成本降序。
 *  COUNT 带 tuple 快捷元组（cap 3）与「已记」标记；QUOTA 带形态（STACKED 只收剩余）；数据与
 *  红黑榜/详情页同一 usageById 装配，录入后全站数字一致。 */
export interface EntryHubRow {
  id: string;
  name: string;
  usageKind: string;
  /** 额度发放形态：STACKED 只收剩余快照 */
  grantMode: string | null;
  usageUnit: string | null;
  /** 日均成本（我的份额口径）：仅排序用 */
  dailyCost: number;
  /** COUNT 快捷元组（我的历史，cap 3）；其他口径为空 */
  tuples: UsageTuple[];
  /** COUNT：今日（北京墙钟）本人已有 DELTA 记录 */
  loggedToday: boolean;
  /** COUNT 自定义展开的单价占位（订阅替代单价） */
  altUnitPrice: number | null;
  /** QUOTA 展开的总额度占位（订阅默认） */
  quotaTotal: number | null;
}
/** 用量装配结果（ui-wave-a ticket 03）：红黑榜 / 录入台 / 订阅列表盈亏与快捷元组共用同一来源，
 *  保证全站同一数字不出两个版本。verdict = 周期 verdict（倒计时数据源，null = 当前无覆盖区间）；
 *  rolling = 滑动窗 headline（ADR-0014，红黑榜与列表盈亏列的对外判定）。 */
export type DashboardUsageMap = Map<
  string,
  {
    sub: SubscriptionWithPayments;
    records: UsageRecord[];
    verdict: UsageVerdict | null;
    rolling: RollingVerdict | null;
  }
>;

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
  entryRows: EntryHubRow[];
  usageById: DashboardUsageMap;
  itemDailyCost: number;
  trend: number[];
}

const CYCLE_LABEL: Record<string, string> = {
  DAY: "日付",
  WEEK: "周付",
  MONTH: "月付",
  YEAR: "年付",
};

/** 北京墙钟「M月D日」（浪费事件/到期 chip 用） */
function mdLabel(dt: Date): string {
  const p = wallParts(dt);
  return `${p.month + 1}月${p.day}日`;
}

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

  // 用量红黑榜：headline 为滑动窗判定（ADR-0014，[今天−30d, 今天) 固定 30 天），按窗口净盈亏排序（按人切片，ADR-0003）。
  // STACKED 先做 AUTO 包读时对账（ADR-0012）并刷新内存中的包列表，verdict 才看得到新生成的包
  await Promise.all(
    subs
      .filter((s) => s.usageKind === "QUOTA" && s.grantMode === "STACKED")
      .map(async (s) => {
        await reconcileAutoPacks(s.id, today);
        s.quotaPacks = await listPacks(s.id);
      }),
  );
  // 用量装配一次完成、三处复用（红黑榜 verdict + 录入台元组与已记判定 + 订阅列表盈亏/快捷录入），避免 N+1 与重复流水线
  const usageSubs = subs.filter((s) => s.usageKind);
  const usageById: DashboardUsageMap = new Map(
    await Promise.all(
      usageSubs.map(async (sub) => {
        const records = await listUsage(sub.id);
        return [sub.id, {
          sub,
          records,
          verdict: getUsageVerdict(sub, records, today, userId),
          rolling: getRollingVerdict(sub, records, today, userId),
        }] as const;
      }),
    ),
  );
  const usageBoard: UsageBoardRow[] = usageSubs
    .map((sub) => {
      const { verdict: v, rolling: r } = usageById.get(sub.id)!;
      if (!r) return null;
      const unit = sub.usageUnit ?? "";
      // 倒计时 chip（周期 verdict 保留为倒计时数据源）：RESET 距重置 + 当前周期使用率；STACKED 下一到期 + 模拟余额
      let countdown: string | undefined;
      if (v?.kind === "QUOTA") {
        countdown = `距重置 ${dayDiff(today, v.periodEnd)} 天 · 本周期已用 ${Math.round(v.usageRate * 100)}%`;
      } else if (v?.kind === "PACK" && v.nextExpiry) {
        countdown = `${mdLabel(v.nextExpiry.date)} 到期 ${v.nextExpiry.quantity} ${unit} · 预计剩 ${v.nextExpiry.projectedBalance} ${unit}`;
      }
      const wasteNote =
        r.kind === "QUOTA" && r.wasteEvents?.length
          ? r.wasteEvents.map((w) => `${mdLabel(w.date)}到期焚毁 ${Math.round(w.quantity * 100) / 100} ${unit}`.trimEnd()).join("；")
          : undefined;
      return {
        id: sub.id,
        name: sub.name,
        windowLabel: `近${r.windowDays}天`,
        quantityLabel:
          r.kind === "COUNT"
            ? `${r.usage} ${unit || "次"}`
            : r.kind === "QUOTA"
              ? `消耗 ${Math.round(r.consumed * 100) / 100} ${unit}`.trimEnd()
              : null,
        paid: r.cost,
        value: r.kind === "SAVINGS" ? r.saved : r.value,
        verdictAmount: r.verdictAmount,
        costUnknown: r.costUnknown,
        ...(r.kind === "COUNT" && r.valueUnknown ? { valueUnknown: true } : {}),
        ...(r.kind === "COUNT" && r.valuePartial ? { valuePartial: true } : {}),
        countdown,
        wasteNote,
        ...(v?.kind === "PACK" && v.staleDays != null && v.staleDays >= 30 ? { stale: true } : {}),
      };
    })
    .filter((r) => r !== null)
    .sort((a, b) => b.verdictAmount - a.verdictAmount);

  // 「记用量」录入台：全部口径的活跃跟踪订阅平铺，日均成本降序（取代 COUNT-only「今日可记」窄条）。
  // 「已记」判定沿用窄条的按人切片逻辑（今日 + 本人 + DELTA）；快捷元组同样只从我的历史提取（ADR-0003）。
  const entryRows: EntryHubRow[] = usageSubs
    .filter((s) => s.status === "ACTIVE")
    .map((s): EntryHubRow => {
      const records = usageById.get(s.id)?.records ?? [];
      const mine = records.filter((r) => r.userId === userId);
      return {
        id: s.id,
        name: s.name,
        usageKind: s.usageKind!,
        grantMode: s.grantMode,
        usageUnit: s.usageUnit,
        dailyCost: views.get(s.id)!.myDailyRate,
        tuples: s.usageKind === "COUNT" ? usageTuples(mine, 3) : [],
        loggedToday: s.usageKind === "COUNT" ? loggedToday(records, isoDay(today), userId) : false,
        altUnitPrice: s.altUnitPrice,
        quotaTotal: s.quotaTotal,
      };
    })
    .sort((a, b) => b.dailyCost - a.dailyCost);

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
    usageById,
    yearSpent,
    activeCount: active.length,
    rows,
    upcoming,
    purchases,
    usageBoard,
    entryRows,
    itemDailyCost,
    trend,
  };
}
