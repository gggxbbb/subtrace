// 报表数据装配（ticket 11）：区间入参与视图模型出口；按天切片算法在 cost-view（与 dashboard 趋势共用）。

import { dayStart, fromWall } from "./dates";
import { dayDiff } from "./cost-engine";
import { listSubscriptions } from "./subscriptions/service";
import { costOverPeriod, paidInPeriod } from "./subscriptions/cost-view";
import { listPurchases } from "./purchases/service";
import { isoDay } from "./dates";

export interface ReportDay {
  date: string; // YYYY-MM-DD
  cost: number;
}

export interface ReportCategory {
  name: string;
  cost: number;
  share: number; // 0–1
}

export interface ReportItem {
  kind: "sub" | "purchase";
  id: string;
  name: string;
  category: string;
  cost: number;
  share: number; // 0–1（占摊销总额）
}

export interface ReportData {
  periodLabel: string;
  start: string;
  end: string; // 排他
  totalAmortized: number;
  totalPaid: number;
  dailyAvg: number;
  categories: ReportCategory[];
  days: ReportDay[];
  /** 逐项摊销成本（订阅/物品，降序） */
  items: ReportItem[];
}

export function monthRange(year: number, month: number): { startMs: number; endMs: number } {
  const startMs = fromWall(year, month - 1, 1).getTime();
  const endMs = (month === 12 ? fromWall(year + 1, 0, 1) : fromWall(year, month, 1)).getTime();
  return { startMs, endMs };
}

export function yearRange(year: number): { startMs: number; endMs: number } {
  return { startMs: fromWall(year, 0, 1).getTime(), endMs: fromWall(year + 1, 0, 1).getTime() };
}

/** 区间内每日摊销成本 + 分类聚合（订阅按份额切片，物品单列一类） */
export async function getReportData(
  userId: string,
  startMs: number,
  endMs: number,
  periodLabel: string,
): Promise<ReportData> {
  const subs = await listSubscriptions(userId);
  const purchases = await listPurchases(userId);
  const period = costOverPeriod({ subs, purchases, viewerId: userId, startMs, endMs });

  // 实付：自有订阅付费 + 物品买入/追加，落在区间内
  let totalPaid = paidInPeriod(
    subs.filter((s) => s.ownerId === userId).flatMap((s) => s.payments),
    startMs,
    endMs,
  );
  for (const p of purchases) {
    const ms = dayStart(p.purchaseDate).getTime();
    if (ms >= startMs && ms < endMs) totalPaid += p.amountBase;
    for (const ev of p.events ?? []) {
      const ems = dayStart(ev.date).getTime();
      if (ems >= startMs && ems < endMs) totalPaid += ev.amountBase;
    }
  }

  const { days, totalAmortized } = period;
  const numDays = Math.max(1, dayDiff(new Date(startMs), new Date(endMs)));
  const categories: ReportCategory[] = period.byCategory
    .map(({ name, cost }) => ({ name, cost, share: totalAmortized > 0 ? cost / totalAmortized : 0 }))
    .sort((a, b) => b.cost - a.cost);

  const items = period.byItem
    .map((it) => ({ ...it, share: totalAmortized > 0 ? it.cost / totalAmortized : 0 }))
    .sort((a, b) => b.cost - a.cost);

  return {
    periodLabel,
    start: isoDay(new Date(startMs)),
    end: isoDay(new Date(endMs)),
    totalAmortized,
    totalPaid,
    dailyAvg: totalAmortized / numDays,
    categories,
    days,
    items,
  };
}
