// 用量周期（纯函数模块，无 DB/框架依赖）。
// ADR-0013：用量窗口与计费成本段解耦——周期窗口按锚点 + 计费周期推进，
// 成本按与窗口相交的成本段日费率分摊。仅依赖 cost-engine / dates 纯函数。

import {
  advanceCycle,
  dayDiff,
  segmentDailyRate,
  type CostSegment,
  type CycleSpec,
} from "../cost-engine";

/** 用量周期窗口 [start, end)（北京日历日对齐，止期排他） */
export interface UsagePeriod {
  start: Date;
  end: Date;
}

/**
 * 从 anchor 起按 cycle 推进的周期窗口序列 [start, end)，
 * 截至覆盖 today 的那个周期为止；today < anchor 时为空。
 */
export function* usagePeriods(
  cycle: CycleSpec,
  anchor: Date,
  today: Date,
): Generator<UsagePeriod> {
  // dayDiff(a, b) = b − a：today < anchor → dayDiff(today, anchor) > 0
  if (dayDiff(today, anchor) > 0) return;
  for (let n = 0; ; n++) {
    const start = advanceCycle(anchor, cycle, n);
    const end = advanceCycle(anchor, cycle, n + 1);
    yield { start, end };
    // 覆盖 today 的周期已产出（today < end → dayDiff(today, end) > 0）即停
    if (dayDiff(today, end) > 0) return;
  }
}

/** 覆盖 today 的当前周期窗口；today < anchor 时为 null。 */
export function currentUsagePeriod(
  cycle: CycleSpec,
  anchor: Date,
  today: Date,
): UsagePeriod | null {
  let current: UsagePeriod | null = null;
  for (const p of usagePeriods(cycle, anchor, today)) current = p;
  return current;
}

/**
 * 与 [start, end) 相交的成本段按日费率分摊的净额。
 * covered = 是否至少与一段相交；amountUnknown = 是否有金额未知段相交（其成本不计入）。
 */
export function periodCost(
  segments: CostSegment[],
  start: Date,
  end: Date,
): { net: number; amountUnknown: boolean; covered: boolean } {
  let net = 0;
  let amountUnknown = false;
  let covered = false;
  for (const seg of segments) {
    const overlapStart = seg.start.getTime() > start.getTime() ? seg.start : start;
    const overlapEnd = seg.end.getTime() < end.getTime() ? seg.end : end;
    const overlapDays = dayDiff(overlapStart, overlapEnd);
    if (overlapDays <= 0) continue;
    covered = true;
    if (seg.amountUnknown) {
      amountUnknown = true;
    } else {
      net += segmentDailyRate(seg) * overlapDays;
    }
  }
  return { net, amountUnknown, covered };
}
