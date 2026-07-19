// 报表数据装配（ticket 11）：成本段按天切片聚合，分类占比与趋势。

import {
  costSegments,
  dayDiff,
  purchaseDailyRate,
  segmentDailyRate,
} from "./cost-engine";
import {
  listSubscriptions,
  toEnginePayments,
  toEngineSub,
} from "./subscriptions/service";
import { listPurchases, toEnginePurchase } from "./purchases/service";
import { shareForViewer } from "./beneficiaries/service";

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

const atUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function monthRange(year: number, month: number): { startMs: number; endMs: number } {
  const startMs = Date.UTC(year, month - 1, 1);
  const endMs = month === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, month, 1);
  return { startMs, endMs };
}

export function yearRange(year: number): { startMs: number; endMs: number } {
  return { startMs: Date.UTC(year, 0, 1), endMs: Date.UTC(year + 1, 0, 1) };
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
  const periodEndDate = new Date(endMs);

  const costByDay = new Map<number, number>();
  const costByCat = new Map<string, number>();
  const costByItem = new Map<string, ReportItem>();
  const bumpItem = (kind: "sub" | "purchase", id: string, name: string, category: string, cost: number) => {
    if (cost === 0) return;
    const cur = costByItem.get(id) ?? { kind, id, name, category, cost: 0, share: 0 };
    cur.cost += cost;
    costByItem.set(id, cur);
  };
  const bump = (ms: number, cat: string, cost: number) => {
    if (cost === 0) return;
    costByDay.set(ms, (costByDay.get(ms) ?? 0) + cost);
    costByCat.set(cat, (costByCat.get(cat) ?? 0) + cost);
  };

  // 订阅：段 ∩ 区间 按天折算
  for (const sub of subs) {
    const share = shareForViewer(sub.beneficiaries, sub.ownerId, userId);
    if (share <= 0) continue;
    const cat = sub.category ?? "未分类";
    const segments = costSegments(toEngineSub(sub), toEnginePayments(sub.payments), periodEndDate);
    for (const seg of segments) {
      const s = Math.max(atUtc(seg.start), startMs);
      const e = Math.min(atUtc(seg.end), endMs);
      if (e <= s) continue;
      const rate = segmentDailyRate(seg) * share;
      bumpItem("sub", sub.id, sub.name, cat, rate * ((e - s) / 86_400_000));
      for (let t = s; t < e; t += 86_400_000) bump(t, cat, rate);
    }
  }

  // 物品：持有期 ∩ 区间 逐日（费率在寿命窗口外随时间递减，按天算）
  for (const p of purchases) {
    const engine = toEnginePurchase(p);
    const holdStart = atUtc(p.purchaseDate);
    const holdEnd = p.endDate ? atUtc(p.endDate) : endMs;
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

  // 实付：自有订阅付费 + 物品买入/追加，落在区间内
  let totalPaid = 0;
  for (const sub of subs.filter((s) => s.ownerId === userId)) {
    for (const p of sub.payments) {
      const ms = atUtc(p.paidAt);
      if (ms >= startMs && ms < endMs) totalPaid += (p.amountBase ?? 0) - p.refundedBase;
    }
  }
  for (const p of purchases) {
    const ms = atUtc(p.purchaseDate);
    if (ms >= startMs && ms < endMs) totalPaid += p.amountBase;
    for (const ev of p.events ?? []) {
      const ems = atUtc(ev.date);
      if (ems >= startMs && ems < endMs) totalPaid += ev.amountBase;
    }
  }

  const days: ReportDay[] = [];
  for (let t = startMs; t < endMs; t += 86_400_000) {
    days.push({ date: iso(t), cost: costByDay.get(t) ?? 0 });
  }
  const totalAmortized = days.reduce((s, d) => s + d.cost, 0);
  const numDays = Math.max(1, dayDiff(new Date(startMs), new Date(endMs)));
  const categories: ReportCategory[] = [...costByCat.entries()]
    .map(([name, cost]) => ({ name, cost, share: totalAmortized > 0 ? cost / totalAmortized : 0 }))
    .sort((a, b) => b.cost - a.cost);

  const items = [...costByItem.values()]
    .map((it) => ({ ...it, share: totalAmortized > 0 ? it.cost / totalAmortized : 0 }))
    .sort((a, b) => b.cost - a.cost);

  return {
    periodLabel,
    start: iso(startMs),
    end: iso(endMs),
    totalAmortized,
    totalPaid,
    dailyAvg: totalAmortized / numDays,
    categories,
    days,
    items,
  };
}
