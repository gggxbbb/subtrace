// 滑动窗判定引擎（ADR-0014）：用量盈亏对外 headline 的统一观察窗。
// 窗口 = [北京墙钟今天−30d, 今天)，固定 30 天（今天为排他终点）；订阅启用不足 30 天收窄为实际天数。
// 净盈亏 = 窗口内用回价值 − periodCost(窗口)，三口径仅价值计量不同：
//   COUNT   = usageValue(窗口)（次数×替代单价，单价跟记录走）
//   SAVINGS = Σ窗口内增量（已省金额本身）
//   QUOTA   = 窗口内消耗 × 折算单价——消耗按相邻快照差归因（snapshotConsumptions，与热力图同粒度），
//             折算单价 = 窗口与各用量周期重叠天数加权的（周期成本 ÷ 总额度）；
//             手动模式 STACKED 无总额度，回退「段净额 ÷ 段内发放包量」（与 pack-ledger 单张成本同口径）。
//   STACKED 另输出窗口内浪费事件（调用方传入 projectPackLedger 全量浪费，按日期过滤）。
// 周期 verdict（service.ts dispatchVerdict）保留供历史回看与倒计时，与本模块互补。
// 纯函数模块：不触 DB；成本段 / 用量周期 / 份额 / 浪费事件由调用方（service.ts）装配。

import { DAY_MS, dayStart, isoDay } from "../dates";
import {
  actualCostPerUse,
  coversDate,
  dayDiff,
  savingsVerdict,
  usageInPeriod,
  usageValue,
  type CostSegment,
  type CycleSpec,
} from "../cost-engine";
import { periodCost, usagePeriods } from "./period";
import { snapshotConsumptions } from "./heatmap";

/** 窗口长度：固定 30 天，无配置入口（ADR-0014） */
export const ROLLING_DAYS = 30;

export interface RollingWindow {
  /** 窗口起（含）：今天−30d 或订阅起始日（取晚者） */
  start: Date;
  /** 窗口止（排他）= 今天零点 */
  end: Date;
  /** 实际天数；启用不足 30 天时 < 30（UI 标注「近 N 天」） */
  days: number;
}

/** 滑动窗口：以今天（北京墙钟）为排他终点的固定 30 天；订阅起始日晚于今天−30d 时收窄 */
export function rollingWindowOf(today: Date, startDate: Date): RollingWindow {
  const end = dayStart(today);
  const earliest = new Date(end.getTime() - ROLLING_DAYS * DAY_MS);
  const anchor = dayStart(startDate);
  const start = anchor > earliest ? anchor : earliest;
  return { start, end, days: Math.max(0, dayDiff(start, end)) };
}

export interface RollingRecord {
  date: Date;
  quantity: number;
  /** DELTA | TOTAL（额度型快照） */
  kind: string;
  /** TOTAL 快照语义：USED | REMAINING；DELTA 为空 */
  semantic: string | null;
  unitPrice?: number | null;
  userId?: string;
}

export interface RollingWasteEvent {
  date: Date;
  quantity: number;
  amount: number;
}

export interface RollingInput {
  kind: "COUNT" | "QUOTA" | "SAVINGS";
  /** QUOTA 包叠加形态（STACKED）：附带窗口内浪费事件 */
  stacked?: boolean;
  altUnitPrice?: number | null;
  quotaTotal?: number | null;
  /** 订阅起始日：启用不足 30 天时窗口收窄 */
  startDate: Date;
  today: Date;
  records: RollingRecord[];
  /** 受益人视角：COUNT/SAVINGS 只计本人记录（QUOTA 池级不切，ADR-0013 D4） */
  forUserId?: string;
  /** 我的成本份额（受益人视角；缺省 1） */
  share?: number;
  /** 成本段（costSegments 输出） */
  segments: CostSegment[];
  /** 用量周期（QUOTA 折算单价按周期加权；null/无重叠 = 回退按成本段加权） */
  usageCycle?: { cycle: CycleSpec; anchor: Date } | null;
  /** STACKED：已确认浪费事件全量（函数内按窗口过滤输出） */
  wasteEvents?: RollingWasteEvent[];
  /** STACKED 手动模式无总额度时的折算基数：包列表（发放日 + 数量） */
  packs?: { grantedAt: Date; quantity: number }[];
}

interface RollingBase {
  windowStart: Date;
  /** 窗口止（排他）= 今天零点 */
  windowEnd: Date;
  windowDays: number;
  /** 窗口内摊销成本（× 份额） */
  cost: number;
  /** 覆盖段金额未知：盈亏不可信，UI 灰显 */
  costUnknown?: boolean;
  /** 净盈亏 = 窗口内用回价值 − 成本 */
  verdictAmount: number;
}

export interface RollingCountVerdict extends RollingBase {
  kind: "COUNT";
  usage: number;
  /** 窗口内用量价值（次数×替代单价，逐条记录级单价） */
  value: number;
  costPerUse: number | null;
}

export interface RollingSavingsVerdict extends RollingBase {
  kind: "SAVINGS";
  /** 窗口内已省金额合计（增量求和） */
  saved: number;
}

export interface RollingQuotaVerdict extends RollingBase {
  kind: "QUOTA";
  /** 窗口内消耗（相邻快照差归因，负差值不计） */
  consumed: number;
  /** 折算单价：窗口与各用量周期重叠天数加权的（周期成本 ÷ 总额度） */
  unitCost: number;
  /** = consumed × unitCost */
  value: number;
  /** STACKED：窗口内已确认浪费事件（按确认日升序）；非 STACKED 无此字段 */
  wasteEvents?: RollingWasteEvent[];
}

export type RollingVerdict = RollingCountVerdict | RollingSavingsVerdict | RollingQuotaVerdict;

/** 窗口内各时段按重叠天数加权的折算单价：候选时段序列（用量周期或成本段），
 *  每段单价 = periodCost(段) ÷ 总额度；无任何重叠为 null。 */
function weightedUnitCost(
  candidates: { start: Date; end: Date }[],
  segments: CostSegment[],
  quotaTotal: number,
  win: RollingWindow,
): number | null {
  let wSum = 0;
  let acc = 0;
  for (const p of candidates) {
    const s = p.start > win.start ? p.start : win.start;
    const e = p.end < win.end ? p.end : win.end;
    const overlapDays = dayDiff(s, e);
    if (overlapDays <= 0) continue;
    acc += overlapDays * (periodCost(segments, p.start, p.end).net / quotaTotal);
    wSum += overlapDays;
  }
  return wSum > 0 ? acc / wSum : null;
}

/** 手动模式 STACKED 的折算单价（无总额度）：段净额 ÷ 段内发放包量（pack-ledger 单张成本同口径），
 *  按段与窗口重叠天数加权；无任何可计价段为 null。 */
function weightedPackUnitCost(
  segments: CostSegment[],
  packs: { grantedAt: Date; quantity: number }[],
  win: RollingWindow,
): number | null {
  let wSum = 0;
  let acc = 0;
  for (const seg of segments) {
    const s = seg.start > win.start ? seg.start : win.start;
    const e = seg.end < win.end ? seg.end : win.end;
    const overlapDays = dayDiff(s, e);
    if (overlapDays <= 0) continue;
    const basis = packs
      .filter((p) => coversDate(seg, p.grantedAt))
      .reduce((sum, p) => sum + p.quantity, 0);
    if (basis <= 0) continue;
    acc += overlapDays * ((seg.amountUnknown ? 0 : seg.net) / basis);
    wSum += overlapDays;
  }
  return wSum > 0 ? acc / wSum : null;
}

/**
 * 滑动窗判定：三口径统一净盈亏。窗口无成本覆盖（无相交段）为 null（与周期 verdict 无覆盖同语义）；
 * COUNT 无替代单价 / QUOTA 无总额度或无法折算单价时为 null。
 * 窗口为空（当日启用 / 尚未开始，days=0）出零值判定而非 null——行不消失，UI 标注「今日启用」。
 */
export function rollingVerdict(input: RollingInput): RollingVerdict | null {
  const win = rollingWindowOf(input.today, input.startDate);
  if (win.days <= 0) {
    const zero = { windowStart: win.start, windowEnd: win.end, windowDays: 0, cost: 0, verdictAmount: 0 };
    if (input.kind === "SAVINGS") return { kind: "SAVINGS", ...zero, saved: 0 };
    if (input.kind === "COUNT") return { kind: "COUNT", ...zero, usage: 0, value: 0, costPerUse: null };
    return { kind: "QUOTA", ...zero, consumed: 0, unitCost: 0, value: 0, ...(input.stacked ? { wasteEvents: [] as RollingWasteEvent[] } : {}) };
  }
  const pc = periodCost(input.segments, win.start, win.end);
  if (!pc.covered) return null;
  const share = input.share ?? 1;
  const cost = pc.net * share;
  const baseFields = {
    windowStart: win.start,
    windowEnd: win.end,
    windowDays: win.days,
    cost,
    costUnknown: pc.amountUnknown === true,
  };
  const mine = input.forUserId
    ? input.records.filter((r) => r.userId === input.forUserId)
    : input.records;

  if (input.kind === "SAVINGS") {
    // 省钱型：增量求和即已省金额（ADR-0011），盈亏 = Σ已省 − 已摊成本
    const saved = mine
      .filter(
        (r) =>
          r.kind === "DELTA" && dayDiff(win.start, r.date) >= 0 && dayDiff(r.date, win.end) > 0,
      )
      .reduce((s, r) => s + r.quantity, 0);
    return { kind: "SAVINGS", ...baseFields, saved, verdictAmount: savingsVerdict(cost, saved) };
  }

  if (input.kind === "COUNT") {
    if (input.altUnitPrice == null) return null;
    const entries = mine.map((r) => ({
      date: r.date,
      quantity: r.quantity,
      kind: r.kind as "DELTA" | "TOTAL",
      unitPrice: r.unitPrice ?? undefined,
    }));
    const usage = usageInPeriod(entries, win.start, win.end);
    const value = usageValue(entries, win.start, win.end, input.altUnitPrice);
    return {
      kind: "COUNT",
      ...baseFields,
      usage,
      value,
      verdictAmount: value - cost,
      costPerUse: actualCostPerUse(cost, usage),
    };
  }

  // QUOTA：池级口径（不按人切快照，ADR-0013 D4）；消耗 = 相邻快照差（与热力图同粒度），
  // 负差值（额度复位/充值/反向校准）非消耗、不计。
  const total = input.quotaTotal;
  const packBasis = (total == null || total <= 0) && input.stacked && (input.packs?.length ?? 0) > 0;
  if ((total == null || total <= 0) && !packBasis) return null;
  const winStartDay = isoDay(win.start);
  const winEndDay = isoDay(win.end);
  const consumed = snapshotConsumptions(
    input.records
      .filter((r) => r.kind === "TOTAL")
      .map((r) => ({ date: isoDay(r.date), quantity: r.quantity, semantic: r.semantic }))
      .filter((r) => r.date >= winStartDay && r.date < winEndDay),
  ).reduce((s, c) => s + Math.max(0, c.consumed), 0);
  // 折算单价：窗口与各用量周期重叠天数加权；无周期可推导/无重叠时回退按成本段加权；
  // 手动模式 STACKED 无总额度时按段内发放包量折算（pack-ledger 单张成本同口径）
  let unitCost: number | null;
  if (packBasis) {
    unitCost = weightedPackUnitCost(input.segments, input.packs ?? [], win);
  } else {
    unitCost = input.usageCycle
      ? weightedUnitCost(
          [...usagePeriods(input.usageCycle.cycle, input.usageCycle.anchor, input.today)],
          input.segments,
          total!,
          win,
        )
      : null;
    unitCost = unitCost ?? weightedUnitCost(input.segments, input.segments, total!, win);
  }
  if (unitCost === null) return null;
  const value = consumed * unitCost;
  const wasteEvents = input.stacked
    ? (input.wasteEvents ?? [])
        .filter((w) => w.date >= win.start && w.date < win.end)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
    : undefined;
  return {
    kind: "QUOTA",
    ...baseFields,
    consumed,
    unitCost,
    value,
    verdictAmount: value - cost,
    ...(wasteEvents ? { wasteEvents } : {}),
  };
}
