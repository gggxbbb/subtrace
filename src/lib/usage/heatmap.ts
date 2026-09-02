/** 压缩用量热力图：序列化记录 → 周为列的格子矩阵（7 行 × 53 列，周一为首，北京墙钟）。 */

import { DAY_MS, dayStart, isoDay, parseDay, wallDow } from "../dates";

export type HeatmapUsageKind = "COUNT" | "QUOTA" | "SAVINGS";

export interface HeatmapRecord {
  /** 北京日历日 "YYYY-MM-DD" */
  date: string;
  quantity: number;
  /** DELTA | TOTAL（额度型快照） */
  kind: string;
  /** TOTAL 快照语义：USED=已用量 | REMAINING=剩余量；DELTA 为空 */
  semantic: string | null;
}

/**
 * 相邻快照差值消耗（热力图与滑动窗 rolling.ts 共用，同粒度近似，ADR-0014）。
 * 输入 TOTAL 快照（任意顺序），按日期升序输出每个快照日的消耗：
 * REMAINING = 较上一快照的降量；USED = 较上一快照的增量；首个快照无前值可差记 0。
 * 负差值（额度复位/充值/反向校准）如实保留，由调用方决定如何解读。
 */
export function snapshotConsumptions(
  snapshots: { date: string; quantity: number; semantic: string | null }[],
): { date: string; consumed: number }[] {
  const sorted = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let prev: number | null = null;
  return sorted.map((s) => {
    const consumed =
      prev === null ? 0 : s.semantic === "REMAINING" ? prev - s.quantity : s.quantity - prev;
    prev = s.quantity;
    return { date: s.date, consumed };
  });
}

export interface HeatmapCell {
  date: string;
  /** 0 = 空白；1-4 = 窗口内正值按分位 25/50/75/100 分档 */
  level: 0 | 1 | 2 | 3 | 4;
  /** 当日值（计数=Σ用量，省钱=Σ金额，额度=较上一快照消耗；消耗 ≤0 如实保留但 level 0） */
  value: number;
  /** false = 今天之后的未来日（占格不渲染） */
  inWindow: boolean;
}

/** 时间窗固定 53 周：今天所在周的周一往前 52 周为首日 */
const WEEKS = 53;

/**
 * 分桶 + 刻度。窗口外记录忽略；QUOTA 的首个窗口内快照无前值可差，记 value 0。
 * today 传 Date（任意瞬间，按北京墙钟取日历日）或 "YYYY-MM-DD"。
 */
export function usageHeatmap(
  records: HeatmapRecord[],
  kind: HeatmapUsageKind,
  today: Date | string,
): HeatmapCell[][] {
  const todayMs = (typeof today === "string" ? parseDay(today) : dayStart(today)).getTime();
  // 对齐周一（北京墙钟：wallDow 0=周日 → 周一为首换算）
  const weekMondayMs = todayMs - ((wallDow(new Date(todayMs)) + 6) % 7) * DAY_MS;
  const startMs = weekMondayMs - (WEEKS - 1) * 7 * DAY_MS;

  // 窗口内逐日值（窗口外记录忽略：不参与分桶，QUOTA 也不作为差值前值）
  const startDay = isoDay(new Date(startMs));
  const todayDay = isoDay(new Date(todayMs));
  const inWindowRecords = records.filter((r) => r.date >= startDay && r.date <= todayDay);
  const values = new Map<string, number>();
  if (kind === "QUOTA") {
    // 仅 TOTAL 快照日有值：较上一快照的消耗（REMAINING 降量 / USED 增量）
    for (const c of snapshotConsumptions(inWindowRecords.filter((r) => r.kind === "TOTAL"))) {
      values.set(c.date, c.consumed);
    }
  } else {
    // COUNT / SAVINGS：当日 Σ quantity（省钱型 quantity 即金额）
    for (const r of inWindowRecords) {
      values.set(r.date, (values.get(r.date) ?? 0) + r.quantity);
    }
  }

  // 生成格子矩阵（列 = 周，行 = 周一~周日）
  const weeks: HeatmapCell[][] = [];
  for (let c = 0; c < WEEKS; c++) {
    const week: HeatmapCell[] = [];
    for (let r = 0; r < 7; r++) {
      const ms = startMs + (c * 7 + r) * DAY_MS;
      const date = isoDay(new Date(ms));
      week.push({ date, level: 0, value: values.get(date) ?? 0, inWindow: ms <= todayMs });
    }
    weeks.push(week);
  }

  // 5 档分位刻度：窗口内正值排序，按名次均分 4 档（并列同档；单一值 → 4）
  const positives = weeks
    .flat()
    .map((c) => c.value)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (positives.length > 0) {
    for (const week of weeks) {
      for (const cell of week) {
        if (cell.value > 0) {
          const rank = positives.indexOf(cell.value);
          cell.level = Math.min(4, Math.ceil((4 * (rank + 1)) / positives.length)) as HeatmapCell["level"];
        }
      }
    }
  }
  return weeks;
}
