/** 用量记录按月聚合（ui-wave-b ticket 02）：计数型 total = Σ 次数；省钱型 quantity 即已省金额，渲染层换单位 */

export interface MonthlyUsage {
  /** "YYYY-MM"，北京墙钟月（记录 date 本身已是北京 ISO 日，取前 7 位即可） */
  month: string;
  count: number;
  total: number;
}

/** 输入记录管理页当前筛选后的行集（UsageRow 兼容子集），输出月降序聚合 */
export function monthlyUsageAggregation(rows: { date: string; quantity: number }[]): MonthlyUsage[] {
  const byMonth = new Map<string, MonthlyUsage>();
  for (const r of rows) {
    const month = r.date.slice(0, 7);
    const bucket = byMonth.get(month) ?? { month, count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += r.quantity;
    byMonth.set(month, bucket);
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** 月份首末日：月末 = 次月 1 日减一天（Date.UTC 月份溢出自然处理跨年，如 2025-12 → 2026-01） */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
