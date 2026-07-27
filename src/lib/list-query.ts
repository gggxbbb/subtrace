// 列表页排序/筛选纯函数（ui-polish 03 的测试缝）：作用于计算后的行集合，
// 不碰数据库——日均/月均等派生字段也能排。

export type SortDir = "asc" | "desc";

/**
 * 按 accessor 取出的键排序。字符串按 zh-CN locale 比较。
 * null 键恒排最后（与方向无关）——到期日未知的订阅不应霸占顶部。
 */
export function sortBy<T>(rows: T[], dir: SortDir, key: (row: T) => string | number | Date | null): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    const va = ka instanceof Date ? ka.getTime() : ka;
    const vb = kb instanceof Date ? kb.getTime() : kb;
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "zh-CN") : va - (vb as number);
    return cmp * sign;
  });
}

/** 订阅状态筛选口径：与列表状态徽标同一推导（lockstep） */
export type SubStatusFilter = "ok" | "soon" | "expired" | "cancelled";

export function subStatusOf(s: { status: string; daysUntilExpiry: number | null }): SubStatusFilter {
  if (s.status === "CANCELLED") return "cancelled";
  if (s.daysUntilExpiry !== null && s.daysUntilExpiry < 0) return "expired";
  if (s.daysUntilExpiry !== null && s.daysUntilExpiry <= 14) return "soon";
  return "ok";
}

/** 关键字匹配：名称包含、大小写不敏感、忽略两端空白 */
export function matchesKeyword(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.trim().toLowerCase());
}
