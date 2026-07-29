// 成本引擎（纯函数模块，无 DB/框架依赖）。
// 语义见 CONTEXT.md 与 docs/adr/0001~0004。所有金额为已快照的主币种金额。

export type CycleSpec =
  | { kind: "calendar"; unit: "day" | "week" | "month" | "year"; count: number }
  | { kind: "fixedDays"; days: number };

export interface SubscriptionDef {
  trackingMode: "cycle" | "manual";
  startDate: Date;
  /** 周期模式：推算基准日（付费记录可改写锚点） */
  anchorDate?: Date;
  /** 周期模式：计费周期 */
  cycle?: CycleSpec;
  /** 周期模式：标准价（主币种快照），未记账周期计成本用 */
  listPriceBase?: number;
}

export interface PaymentRec {
  /** 实付（主币种快照）；null = 金额未知（ticket 12） */
  amountBase: number | null;
  /** 退款（主币种），成本按净额 */
  refundedBase: number;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
}

import { DAY_MS, dayStart, fromWall, wallParts } from "../dates";

/** 整日天数差（end − start），日期归一到北京日历日零点 */
export function dayDiff(start: Date, end: Date): number {
  return Math.round((dayStart(end).getTime() - dayStart(start).getTime()) / DAY_MS);
}

/**
 * 锚定日期 + n 个计费周期。
 * 日历月/年锚定原始日：目标月没有该日则取月末（1/31 + 1月 = 2/28，+ 2月 = 3/31）。
 */
export function advanceCycle(anchor: Date, cycle: CycleSpec, n: number): Date {
  const a = dayStart(anchor);
  if (cycle.kind === "fixedDays") {
    return new Date(a.getTime() + n * cycle.days * DAY_MS);
  }
  const { year: y, month: m, day } = wallParts(a);
  switch (cycle.unit) {
    case "day":
      return new Date(a.getTime() + n * cycle.count * DAY_MS);
    case "week":
      return new Date(a.getTime() + n * cycle.count * 7 * DAY_MS);
    case "month":
    case "year": {
      const months = cycle.unit === "month" ? n * cycle.count : n * cycle.count * 12;
      const total = y * 12 + m + months;
      const ty = Math.floor(total / 12);
      const tm = ((total % 12) + 12) % 12;
      const monthLen = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
      return fromWall(ty, tm, Math.min(day, monthLen));
    }
  }
}

/**
 * 到期日 = 最后一笔付费记录的服务止期（ADR-0001）。
 * 无付费记录时，周期模式推算锚定日期 + k×周期 中第一个 ≥ today 的日期；手动模式为 null。
 */
export function currentExpiry(
  sub: SubscriptionDef,
  payments: PaymentRec[],
  today: Date,
): Date | null {
  if (payments.length > 0) {
    return payments.reduce((max, p) => (p.periodEnd > max ? p.periodEnd : max), payments[0].periodEnd);
  }
  if (sub.trackingMode !== "cycle" || !sub.anchorDate || !sub.cycle) return null;
  for (let k = 1; ; k++) {
    const candidate = advanceCycle(sub.anchorDate, sub.cycle, k);
    if (dayDiff(today, candidate) >= 0) return candidate;
  }
}

/** 成本段：一段服务区间及其净额（主币种）。estimated=未记账的推算段 */
export interface CostSegment {
  net: number;
  start: Date;
  end: Date;
  /** 金额未知（ticket 12）：净额置 0，费率为 0 不计入合计 */
  amountUnknown?: boolean;
  estimated: boolean;
}

/**
 * 订阅的成本段序列（ADR-0001/0004）。
 * 付费记录 → 段（净额 = 实付 − 退款）；周期模式下，记录未覆盖的推算区间按标准价补齐，
 * 从最后一个止期按周期链式推进，直到覆盖 today 所在段为止。
 */
export function costSegments(
  sub: SubscriptionDef,
  payments: PaymentRec[],
  today: Date,
): CostSegment[] {
  const segs: CostSegment[] = payments
    .slice()
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
    .map((p) => ({
      net: (p.amountBase ?? 0) - p.refundedBase,
      start: p.periodStart,
      end: p.periodEnd,
      amountUnknown: p.amountBase === null,
      estimated: false,
    }));
  if (sub.trackingMode !== "cycle" || !sub.anchorDate || !sub.cycle || sub.listPriceBase == null) {
    return segs;
  }
  // 前向补齐：首笔付费之前的未记账周期（从起始日起算——锚点可能已被记录改写）。
  // 与首笔记录交叠的周期截断到记录起点，净额按天折算。
  const backfill: CostSegment[] = [];
  if (segs.length > 0) {
    let cursor = sub.startDate;
    const firstStart = segs[0].start;
    while (dayDiff(cursor, firstStart) > 0) {
      const next = advanceCycle(cursor, sub.cycle, 1);
      if (dayDiff(next, firstStart) >= 0) {
        backfill.push({ net: sub.listPriceBase, start: cursor, end: next, estimated: true });
        cursor = next;
      } else {
        const full = dayDiff(cursor, next);
        const part = dayDiff(cursor, firstStart);
        if (part > 0) {
          backfill.push({ net: (sub.listPriceBase * part) / full, start: cursor, end: firstStart, estimated: true });
        }
        break;
      }
    }
  }
  // 后向补齐：最后止期之后的推算周期，直到覆盖 today。
  // 无付费记录时锚点是“服务起点”——锚点即今天也要推出 [今天, +1周期) 段；
  // 有记录时止期即今天则不覆盖（到期日当天起不再覆盖）。
  const afterfill: CostSegment[] = [];
  let cursor = segs.length > 0 ? segs[segs.length - 1].end : sub.anchorDate;
  while (dayDiff(today, cursor) < 0 || (segs.length === 0 && afterfill.length === 0 && dayDiff(today, cursor) === 0)) {
    const next = advanceCycle(cursor, sub.cycle, 1);
    afterfill.push({ net: sub.listPriceBase, start: cursor, end: next, estimated: true });
    cursor = next;
  }
  return segs.length > 0 ? [...backfill, ...segs, ...afterfill] : afterfill;
}

/** 段日费率 = 净额 / 覆盖天数 */
export function segmentDailyRate(seg: CostSegment): number {
  return seg.net / dayDiff(seg.start, seg.end);
}

/** 段是否覆盖某日（[start, end) 排他，按北京日历日归一）：覆盖谓词的唯一实现 */
export function coversDate(seg: CostSegment, date: Date): boolean {
  return dayDiff(seg.start, date) >= 0 && dayDiff(date, seg.end) > 0;
}

/** 订阅当日费率：today 所有覆盖段的费率之和（重叠段相加）；无覆盖为 0 */
export function currentDailyRate(
  sub: SubscriptionDef,
  payments: PaymentRec[],
  today: Date,
): number {
  return costSegments(sub, payments, today)
    .filter((s) => coversDate(s, today))
    .reduce((sum, s) => sum + segmentDailyRate(s), 0);
}

/** 物品（回本模型摊销） */
export interface PurchaseDef {
  amountBase: number;
  /** 追加费用事件合计（配件/维修等，主币种），与买入价共用同一摊销窗口 */
  extraBase?: number;
  /** 事件带来的寿命延长合计（天） */
  extraDays?: number;
  /** 残值（主币种），卖出/报废时从累计净额扣除 */
  resaleBase?: number;
  purchaseDate: Date;
  expectedDays?: number;
  status: "in_use" | "retired" | "sold";
  endDate?: Date;
}

/**
 * 物品模型费率 = (金额 + 追加事件 − 残值) / 摊销天数。
 * 摊销止期：卖出/报废日；预期寿命（含事件延长）内 → 购买日 + 寿命（固定费率）；超期或未定寿命 → today（递减）。
 */
/** 物品累计净额 = 买入 + 追加事件 − 残值 */
export function purchaseNet(p: PurchaseDef): number {
  return p.amountBase + (p.extraBase ?? 0) - (p.resaleBase ?? 0);
}

export function purchaseDailyRate(p: PurchaseDef, today: Date): number {
  const net = purchaseNet(p);
  const lifeDays = p.expectedDays != null ? p.expectedDays + (p.extraDays ?? 0) : undefined;
  const expectedEnd =
    lifeDays != null
      ? new Date(dayStart(p.purchaseDate).getTime() + lifeDays * DAY_MS)
      : undefined;
  const end =
    p.status !== "in_use" && p.endDate
      ? p.endDate
      : expectedEnd && dayDiff(today, expectedEnd) > 0
        ? expectedEnd
        : today;
  return net / Math.max(1, dayDiff(p.purchaseDate, end));
}

/** 物品当日成本：仅持有中产生；已卖出/报废为 0 */
export function purchaseCurrentDailyRate(p: PurchaseDef, today: Date): number {
  return p.status === "in_use" ? purchaseDailyRate(p, today) : 0;
}

/** 回本进度 = 已持有天数 / 预期寿命（含事件延长，封顶 1）；未定寿命为 undefined */
export function breakevenProgress(p: PurchaseDef, today: Date): number | undefined {
  if (p.expectedDays == null) return undefined;
  return Math.min(1, dayDiff(p.purchaseDate, today) / (p.expectedDays + (p.extraDays ?? 0)));
}

/** 受益人份额 = 总额 × 我的权重 / Σ权重（改权重全局重算，ADR-0003） */
export function shareOf(
  total: number,
  weights: { userId: string; weight: number }[],
  userId: string,
): number {
  const sum = weights.reduce((s, w) => s + w.weight, 0);
  const mine = weights.find((w) => w.userId === userId)?.weight ?? 0;
  return sum > 0 ? (total * mine) / sum : 0;
}

/** 盈亏 = 用量 × 替代单价 − 已摊成本（正=赚，负=亏） */
export function verdict(costShare: number, usageQty: number, altUnitPrice: number): number {
  return usageQty * altUnitPrice - costShare;
}

/** 每次实际成本 = 已摊 / 用量；无用量时为 null */
export function actualCostPerUse(costShare: number, usageQty: number): number | null {
  return usageQty > 0 ? costShare / usageQty : null;
}

/**
 * 联合会员分摊（ADR-0002）：打包实付 × 子会员标准价 / Σ标准价。
 * 原价未知（0）的子会员不参与分摊；全部未知时全为 0（可手动覆盖）。
 */
export function allocateBundle(totalBase: number, listPrices: number[]): number[] {
  const sum = listPrices.reduce((s, p) => s + Math.max(0, p), 0);
  if (sum <= 0) return listPrices.map(() => 0);
  return listPrices.map((p) => (totalBase * Math.max(0, p)) / sum);
}

export interface UsageEntry {
  date: Date;
  quantity: number;
  /** DELTA=增量（计数型）；TOTAL=累计快照（额度型） */
  kind: "DELTA" | "TOTAL";
}

/**
 * 区间 [start, end) 内的用量：有累计快照取最新快照（额度型），否则增量求和（计数型）。
 */
export function usageInPeriod(records: UsageEntry[], start: Date, end: Date): number {
  const inRange = records.filter(
    (r) => dayDiff(start, r.date) >= 0 && dayDiff(r.date, end) > 0,
  );
  const snapshots = inRange.filter((r) => r.kind === "TOTAL");
  if (snapshots.length > 0) {
    return snapshots.reduce((latest, r) => (r.date > latest.date ? r : latest)).quantity;
  }
  return inRange.reduce((s, r) => s + r.quantity, 0);
}

/**
 * 区间 [start, end) 内的用量价值 = Σ 用量 × 单价。
 * 单价跟记录走：记录上的本次单价优先，空则回退默认替代单价（ADR 货币快照哲学：记录即事实）。
 */
export function usageValue(
  records: (UsageEntry & { unitPrice?: number })[],
  start: Date,
  end: Date,
  defaultUnitPrice: number,
): number {
  const inRange = records.filter(
    (r) => dayDiff(start, r.date) >= 0 && dayDiff(r.date, end) > 0,
  );
  const snapshots = inRange.filter((r) => r.kind === "TOTAL");
  if (snapshots.length > 0) {
    const latest = snapshots.reduce((l, r) => (r.date > l.date ? r : l));
    return latest.quantity * (latest.unitPrice ?? defaultUnitPrice);
  }
  return inRange.reduce((s, r) => s + r.quantity * (r.unitPrice ?? defaultUnitPrice), 0);
}
