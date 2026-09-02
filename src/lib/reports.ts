// 报表数据装配（reports-redo ticket 01）：区间入参解析与视图模型出口；按天切片算法在 cost-view（与 dashboard 趋势共用）。
// 用量回看（ADR-0015）：量化订阅按所选区间判定（intervalVerdict），与 headline 滑动窗同一引擎、同一装配。

import { DAY_MS, dayStart, fromWall, isoDay, parseDay, wallParts } from "./dates";
import { currentExpiry, dayDiff } from "./cost-engine";
import { listSubscriptions, toEnginePayments, toEngineSub } from "./subscriptions/service";
import { costOverPeriod, paidNet } from "./subscriptions/cost-view";
import { listPurchases } from "./purchases/service";
import { EVENT_KIND_LABEL } from "./purchases/kinds";
import {
  getIntervalVerdict,
  getUsageVerdict,
  listPacks,
  listUsage,
  reconcileAutoPacks,
} from "./usage/service";
import { intervalWindowOf } from "./usage/rolling";

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

/** 双口径趋势桶：逐日/逐周桶 label = 桶起日 YYYY-MM-DD；逐月桶 label = YYYY-MM */
export interface ReportTrendBucket {
  label: string;
  amortized: number;
  paid: number;
}

/** 倒计时信号：额度型 = 距重置日；其他 = 到期日（STACKED 取下一包到期日） */
export interface ReportCountdown {
  kind: "reset" | "expiry";
  /** 目标日 YYYY-MM-DD */
  date: string;
  /** 距今天数（负值 = 已过） */
  days: number;
}

/** 用量回看行：区间内每个量化订阅（有摊销成本或有用量记录者）一行的盈亏复盘 */
export interface ReportUsageRow {
  id: string;
  name: string;
  /** 口径：COUNT 计数 / QUOTA 额度 / SAVINGS 省钱 */
  kind: "COUNT" | "QUOTA" | "SAVINGS";
  /** 用量单位（SAVINGS 恒空串） */
  unit: string;
  /** 实际窗口天数（订阅启用晚于区间起时收窄） */
  windowDays: number;
  /** 付了：区间摊销成本（视角份额后） */
  paid: number;
  /** 用回：区间用回价值（SAVINGS = Σ已省） */
  value: number;
  /** 净盈亏 = value − paid */
  net: number;
  /** 每次实际成本（COUNT = paid ÷ 次数；其他口径 null） */
  costPerUse: number | null;
  costUnknown?: boolean;
  valueUnknown?: boolean;
  valuePartial?: boolean;
  countdown: ReportCountdown | null;
}

/** 实付流水行：区间内付费记录 + 物品买入/追加费用（供页面展示与 CSV 导出复用） */
export interface ReportPayment {
  date: string; // YYYY-MM-DD
  name: string;
  /** 原币金额（金额未知为 null） */
  amount: number | null;
  currency: string;
  /** 折算主币金额（付费记录为净额 = 快照 − 退款） */
  amountBase: number;
}

export interface ReportData {
  periodLabel: string;
  start: string;
  end: string; // 排他
  totalAmortized: number;
  totalPaid: number;
  dailyAvg: number;
  /** 摊销拆分：订阅 vs 物品（两列之和 = totalAmortized） */
  subAmortized: number;
  itemAmortized: number;
  /** 日均拆分（两列之和 = dailyAvg） */
  subDailyAvg: number;
  itemDailyAvg: number;
  categories: ReportCategory[];
  days: ReportDay[];
  /** 双口径趋势序列：粒度按区间长度（≤62 天逐日，≤210 天逐周，否则逐月） */
  trend: ReportTrendBucket[];
  /** 用量回看行（按净盈亏升序：亏的在前） */
  usageRows: ReportUsageRow[];
  /** 区间总盈亏汇总；hasUnknown = 有行带三态未知标注（汇总仅供参考） */
  usageTotal: { paid: number; value: number; net: number; hasUnknown: boolean };
  /** 逐项摊销成本（订阅/物品，降序） */
  items: ReportItem[];
  /** 实付流水（按日期升序） */
  payments: ReportPayment[];
}

export function monthRange(year: number, month: number): { startMs: number; endMs: number } {
  const startMs = fromWall(year, month - 1, 1).getTime();
  const endMs = (month === 12 ? fromWall(year + 1, 0, 1) : fromWall(year, month, 1)).getTime();
  return { startMs, endMs };
}

export function yearRange(year: number): { startMs: number; endMs: number } {
  return { startMs: fromWall(year, 0, 1).getTime(), endMs: fromWall(year + 1, 0, 1).getTime() };
}

/** 自定义区间：起/止均为北京日历日、止日含（endMs = 止日 +1 天，排他）；
 *  起 = 止 → 单日区间；非法日期（含 02-30 这类 rollover）或起 > 止为 null */
export function customRange(startDay: string, endDay: string): { startMs: number; endMs: number } | null {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDay(parseDay(s)) === s;
  if (!valid(startDay) || !valid(endDay)) return null;
  const s = parseDay(startDay);
  const e = parseDay(endDay);
  if (s.getTime() > e.getTime()) return null;
  return { startMs: s.getTime(), endMs: e.getTime() + DAY_MS };
}

/** period 串统一解析出口（报表页与 CSV 导出路由共用） */
export interface ReportPeriod {
  kind: "month" | "year" | "custom";
  /** 规范化 period 串：月 YYYY-MM / 年 YYYY / 自定义 YYYY-MM-DD:YYYY-MM-DD（止日含） */
  period: string;
  startMs: number;
  endMs: number; // 排他
  label: string;
}

/** 解析 period 串：缺省/空 = 当前月；非法格式、起 > 止、自定义止期在未来 → null。
 *  now 可注入（测试缝），缺省取服务器北京墙钟今天 */
export function parseReportPeriod(raw: string | undefined, now?: Date): ReportPeriod | null {
  const wp = wallParts(now ?? new Date());
  if (!raw) {
    const { startMs, endMs } = monthRange(wp.year, wp.month + 1);
    return {
      kind: "month",
      period: `${wp.year}-${String(wp.month + 1).padStart(2, "0")}`,
      startMs,
      endMs,
      label: `${wp.year} 年 ${wp.month + 1} 月`,
    };
  }
  let m = raw.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    const { startMs, endMs } = monthRange(Number(m[1]), month);
    return { kind: "month", period: raw, startMs, endMs, label: `${m[1]} 年 ${month} 月` };
  }
  m = raw.match(/^(\d{4})$/);
  if (m) {
    const { startMs, endMs } = yearRange(Number(m[1]));
    return { kind: "year", period: raw, startMs, endMs, label: `${m[1]} 年` };
  }
  m = raw.match(/^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (m) {
    const range = customRange(m[1], m[2]);
    if (!range) return null;
    if (m[2] > isoDay(now ?? new Date())) return null; // 拒绝未来止期（止日 = 今天放行）
    return { kind: "custom", period: raw, ...range, label: `${m[1]} ~ ${m[2]}` };
  }
  return null;
}

/** 趋势粒度：区间 ≤62 天逐日，≤210 天逐周，否则逐月（月视图逐日、年视图逐月即其特例） */
export function trendGranularity(numDays: number): "day" | "week" | "month" {
  if (numDays <= 62) return "day";
  if (numDays <= 210) return "week";
  return "month";
}

/** 区间内每日摊销成本 + 分类聚合（订阅按份额切片，物品单列一类） + 双口径趋势 + 用量回看 + 实付流水。
 *  now 可注入（测试缝）：倒计时与 STACKED 对账的「今天」。 */
export async function getReportData(
  userId: string,
  startMs: number,
  endMs: number,
  periodLabel: string,
  now?: Date,
): Promise<ReportData> {
  const today = dayStart(now ?? new Date());
  const subs = await listSubscriptions(userId);
  const purchases = await listPurchases(userId);
  const period = costOverPeriod({ subs, purchases, viewerId: userId, startMs, endMs });

  // 实付流水：自有订阅付费 + 物品买入/追加，落在区间内（按北京日历日过滤）
  const paidByDay = new Map<string, number>();
  const payments: ReportPayment[] = [];
  const pushFlow = (date: string, name: string, amount: number | null, currency: string, amountBase: number) => {
    payments.push({ date, name, amount, currency, amountBase });
    paidByDay.set(date, (paidByDay.get(date) ?? 0) + amountBase);
  };
  for (const sub of subs) {
    if (sub.ownerId !== userId) continue;
    for (const p of sub.payments) {
      const ms = dayStart(p.paidAt).getTime();
      if (ms >= startMs && ms < endMs) {
        pushFlow(isoDay(p.paidAt), sub.name, p.amount, p.currency ?? "", paidNet(p));
      }
    }
  }
  for (const p of purchases) {
    const ms = dayStart(p.purchaseDate).getTime();
    if (ms >= startMs && ms < endMs) pushFlow(isoDay(p.purchaseDate), p.name, p.amount, p.currency, p.amountBase);
    for (const ev of p.events ?? []) {
      const ems = dayStart(ev.date).getTime();
      if (ems >= startMs && ems < endMs) {
        pushFlow(isoDay(ev.date), `${p.name} · ${EVENT_KIND_LABEL[ev.kind] ?? "其他"}`, ev.amount, ev.currency, ev.amountBase);
      }
    }
  }
  payments.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  const totalPaid = payments.reduce((s, f) => s + f.amountBase, 0);

  const { days, totalAmortized } = period;
  const numDays = Math.max(1, dayDiff(new Date(startMs), new Date(endMs)));
  const categories: ReportCategory[] = period.byCategory
    .map(({ name, cost }) => ({ name, cost, share: totalAmortized > 0 ? cost / totalAmortized : 0 }))
    .sort((a, b) => b.cost - a.cost);

  const items = period.byItem
    .map((it) => ({ ...it, share: totalAmortized > 0 ? it.cost / totalAmortized : 0 }))
    .sort((a, b) => b.cost - a.cost);

  // 订阅/物品拆分（byItem 已按视角份额切片，两列之和 = 总额）
  const subAmortized = items.filter((it) => it.kind === "sub").reduce((s, it) => s + it.cost, 0);
  const itemAmortized = items.filter((it) => it.kind === "purchase").reduce((s, it) => s + it.cost, 0);

  // 双口径趋势：逐日合成后按粒度归桶（≤62 天逐日 / ≤210 天逐周 / 否则逐月）
  const gran = trendGranularity(dayDiff(new Date(startMs), new Date(endMs)));
  const trend: ReportTrendBucket[] = [];
  if (gran === "month") {
    let cur: ReportTrendBucket | null = null;
    for (const dday of days) {
      const key = dday.date.slice(0, 7);
      if (!cur || cur.label !== key) {
        cur = { label: key, amortized: 0, paid: 0 };
        trend.push(cur);
      }
      cur.amortized += dday.cost;
      cur.paid += paidByDay.get(dday.date) ?? 0;
    }
  } else {
    const step = gran === "week" ? 7 : 1;
    for (let i = 0; i < days.length; i += step) {
      const bucket: ReportTrendBucket = { label: days[i].date, amortized: 0, paid: 0 };
      for (const dday of days.slice(i, i + step)) {
        bucket.amortized += dday.cost;
        bucket.paid += paidByDay.get(dday.date) ?? 0;
      }
      trend.push(bucket);
    }
  }

  // 用量回看（ADR-0015）：量化订阅按所选区间判定；STACKED 先做 AUTO 包读时对账（与 dashboard 同口径）
  const usageSubs = subs.filter((s) => s.usageKind);
  await Promise.all(
    usageSubs
      .filter((s) => s.usageKind === "QUOTA" && s.grantMode === "STACKED")
      .map(async (s) => {
        await reconcileAutoPacks(s.id, today);
        s.quotaPacks = await listPacks(s.id);
      }),
  );
  const window = { start: new Date(startMs), end: new Date(endMs) };
  const usageRows: ReportUsageRow[] = [];
  for (const sub of usageSubs) {
    const records = await listUsage(sub.id);
    const hasRecords = records.some((r) => {
      const ms = dayStart(r.date).getTime();
      return ms >= startMs && ms < endMs;
    });
    const v = getIntervalVerdict(sub, records, window, today, userId);
    // 收录范围：区间内有摊销成本（含金额未知的覆盖段）或有用量记录者。
    // v===null（QUOTA 无总额度/无法折算单价）时即使有摊销成本也不出行——无额度配置本就算不出用回价值
    if (v ? !(v.cost > 0 || v.costUnknown || hasRecords) : !hasRecords) continue;
    // 倒计时信号：QUOTA 取距重置日（周期 verdict 为数据源），其余取到期日（STACKED 取下一包到期日）
    const pv = getUsageVerdict(sub, records, today, userId);
    let countdown: ReportCountdown | null = null;
    if (pv?.kind === "QUOTA") {
      countdown = { kind: "reset", date: isoDay(pv.periodEnd), days: dayDiff(today, pv.periodEnd) };
    } else if (pv?.kind === "PACK" && pv.nextExpiry) {
      countdown = { kind: "expiry", date: isoDay(pv.nextExpiry.date), days: dayDiff(today, pv.nextExpiry.date) };
    } else {
      const expiry = currentExpiry(toEngineSub(sub), toEnginePayments(sub.payments), today);
      if (expiry) countdown = { kind: "expiry", date: isoDay(expiry), days: dayDiff(today, expiry) };
    }
    usageRows.push({
      id: sub.id,
      name: sub.name,
      kind: sub.usageKind as ReportUsageRow["kind"],
      unit: sub.usageUnit ?? "",
      windowDays: v ? v.windowDays : intervalWindowOf(window.start, window.end, sub.startDate).days,
      paid: v?.cost ?? 0,
      value: v ? (v.kind === "SAVINGS" ? v.saved : v.value) : 0,
      net: v?.verdictAmount ?? 0,
      costPerUse: v?.kind === "COUNT" ? v.costPerUse : null,
      ...(v?.costUnknown ? { costUnknown: true } : {}),
      ...(v?.kind === "COUNT" && v.valueUnknown ? { valueUnknown: true } : {}),
      ...(v?.kind === "COUNT" && v.valuePartial ? { valuePartial: true } : {}),
      countdown,
    });
  }
  usageRows.sort((a, b) => a.net - b.net);
  const usageTotal = {
    paid: usageRows.reduce((s, r) => s + r.paid, 0),
    value: usageRows.reduce((s, r) => s + r.value, 0),
    net: usageRows.reduce((s, r) => s + r.net, 0),
    hasUnknown: usageRows.some((r) => r.costUnknown || r.valueUnknown || r.valuePartial),
  };

  return {
    periodLabel,
    start: isoDay(new Date(startMs)),
    end: isoDay(new Date(endMs)),
    totalAmortized,
    totalPaid,
    dailyAvg: totalAmortized / numDays,
    subAmortized,
    itemAmortized,
    subDailyAvg: subAmortized / numDays,
    itemDailyAvg: itemAmortized / numDays,
    categories,
    days,
    trend,
    usageRows,
    usageTotal,
    items,
    payments,
  };
}
