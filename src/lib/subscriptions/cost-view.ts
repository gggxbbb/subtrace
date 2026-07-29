// 订阅成本视图（cost-assembly）：点视图 / 区间视图 / 实付聚合的唯一装配处。
// 调用方不再直接编排 cost-engine 原语（覆盖谓词、份额切片、按天切片都在这里）。

import {
  coversDate,
  costSegments,
  currentExpiry,
  purchaseDailyRate,
  segmentDailyRate,
  type CostSegment,
} from "../cost-engine";
import { dayStart, isoDay } from "../dates";
import { shareForViewer } from "../beneficiaries/service";
import {
  toEnginePayments,
  toEngineSub,
  type SubscriptionWithRefs,
} from "./service";
import { toEnginePurchase, type PurchaseWithEvents } from "../purchases/service";

export interface CostView {
  /** 全部成本段（含未记账推算段） */
  segments: CostSegment[];
  /** 覆盖今日的成本段（排他日界，coversDate） */
  covering: CostSegment[];
  /** 到期日（ADR-0001） */
  expiry: Date | null;
  /** 视角用户的有效份额（0–1；无分摊时所有者为 1） */
  share: number;
  /** 当日全额费率（覆盖段费率之和） */
  dailyRate: number;
  /** 当日我的份额费率 = dailyRate × share */
  myDailyRate: number;
  /** 覆盖段金额未知（ticket 12）：费率为 0 是「没记」 */
  costUnknown: boolean;
  /** 最后记录止期之后的推算段（未记账，按标准价估计） */
  estimatedRows: { start: Date; end: Date; net: number }[];
}

/** 某订阅在今日的全量成本视图 */
export function costView(
  sub: SubscriptionWithRefs,
  viewerId: string,
  today: Date,
): CostView {
  const engineSub = toEngineSub(sub);
  const payments = toEnginePayments(sub.payments);
  const segments = costSegments(engineSub, payments, today);
  const covering = segments.filter((s) => coversDate(s, today));
  const dailyRate = covering.reduce((sum, s) => sum + segmentDailyRate(s), 0);
  const share = shareForViewer(sub.beneficiaries, sub.ownerId, viewerId);
  const lastRecordedEnd =
    sub.payments.length > 0
      ? sub.payments.reduce((max, p) => (p.periodEnd > max ? p.periodEnd : max), sub.payments[0].periodEnd)
      : null;
  return {
    segments,
    covering,
    expiry: currentExpiry(engineSub, payments, today),
    share,
    dailyRate,
    myDailyRate: dailyRate * share,
    costUnknown: covering.some((s) => s.amountUnknown === true),
    estimatedRows: segments
      .filter((s) => s.estimated && (lastRecordedEnd === null || s.start >= lastRecordedEnd))
      .map((s) => ({ start: s.start, end: s.end, net: s.net })),
  };
}

/** 付费记录净额 = 实付快照 − 退款；金额未知按 0（不产生费率，也不计实付） */
export function paidNet(p: { amountBase: number | null; refundedBase: number }): number {
  return (p.amountBase ?? 0) - p.refundedBase;
}

/** 区间内实付合计（按支付日的北京日历日过滤，[startMs, endMs)） */
export function paidInPeriod(
  payments: { amountBase: number | null; refundedBase: number; paidAt: Date }[],
  startMs: number,
  endMs: number,
): number {
  return payments.reduce((s, p) => {
    const ms = dayStart(p.paidAt).getTime();
    return ms >= startMs && ms < endMs ? s + paidNet(p) : s;
  }, 0);
}

export interface PeriodItem {
  kind: "sub" | "purchase";
  id: string;
  name: string;
  category: string;
  cost: number;
}

export interface PeriodCost {
  /** 每日摊销成本（YYYY-MM-DD，区间逐日） */
  days: { date: string; cost: number }[];
  /** 分类聚合（订阅按自身分类，物品单列「物品」类） */
  byCategory: { name: string; cost: number }[];
  /** 逐项聚合（订阅/物品，按成本降序由调用方排） */
  byItem: PeriodItem[];
  totalAmortized: number;
}

/**
 * 区间成本视图：段算一次，按天切片（dashboard 趋势与报表共用）。
 * 订阅按视角份额切片（ADR-0003）；物品费率为回本模型逐日值。
 */
export function costOverPeriod(input: {
  subs: SubscriptionWithRefs[];
  purchases: PurchaseWithEvents[];
  viewerId: string;
  startMs: number;
  endMs: number;
}): PeriodCost {
  const { subs, purchases, viewerId, startMs, endMs } = input;
  const periodEndDate = new Date(endMs);
  const atDay = (d: Date) => dayStart(d).getTime();

  const costByDay = new Map<number, number>();
  const costByCat = new Map<string, number>();
  const costByItem = new Map<string, PeriodItem>();
  const bump = (ms: number, cat: string, cost: number) => {
    if (cost === 0) return;
    costByDay.set(ms, (costByDay.get(ms) ?? 0) + cost);
    costByCat.set(cat, (costByCat.get(cat) ?? 0) + cost);
  };
  const bumpItem = (kind: "sub" | "purchase", id: string, name: string, category: string, cost: number) => {
    if (cost === 0) return;
    const cur = costByItem.get(id) ?? { kind, id, name, category, cost: 0 };
    cur.cost += cost;
    costByItem.set(id, cur);
  };

  for (const sub of subs) {
    const share = shareForViewer(sub.beneficiaries, sub.ownerId, viewerId);
    if (share <= 0) continue;
    const cat = sub.category ?? "未分类";
    const segments = costSegments(toEngineSub(sub), toEnginePayments(sub.payments), periodEndDate);
    for (const seg of segments) {
      const s = Math.max(atDay(seg.start), startMs);
      const e = Math.min(atDay(seg.end), endMs);
      if (e <= s) continue;
      const rate = segmentDailyRate(seg) * share;
      bumpItem("sub", sub.id, sub.name, cat, rate * ((e - s) / 86_400_000));
      for (let t = s; t < e; t += 86_400_000) bump(t, cat, rate);
    }
  }

  for (const p of purchases) {
    const engine = toEnginePurchase(p);
    const holdStart = atDay(p.purchaseDate);
    const holdEnd = p.endDate ? atDay(p.endDate) : endMs;
    const s = Math.max(holdStart, startMs);
    const e = Math.min(holdEnd, endMs);
    let itemCost = 0;
    for (let t = s; t < e; t += 86_400_000) {
      const c = purchaseDailyRate(engine, new Date(t));
      itemCost += c;
      bump(t, "物品", c);
    }
    bumpItem("purchase", p.id, p.name, "物品", itemCost);
  }

  const days: { date: string; cost: number }[] = [];
  for (let t = startMs; t < endMs; t += 86_400_000) {
    days.push({ date: isoDay(new Date(t)), cost: costByDay.get(t) ?? 0 });
  }
  return {
    days,
    byCategory: [...costByCat.entries()].map(([name, cost]) => ({ name, cost })),
    byItem: [...costByItem.values()],
    totalAmortized: days.reduce((s, d) => s + d.cost, 0),
  };
}
