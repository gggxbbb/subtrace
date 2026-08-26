/** 用量×单价 元组：从历史记录提取去重组合（最近优先），详情页录入表单与快捷录入共用。 */

export interface UsageTuple {
  quantity: number;
  unitPrice: number | null;
}

/**
 * 全历史去重（quantity + unitPrice 严格相等视为重复）、最近优先。
 * cap 缺省 6（详情页表单）；快捷录入传 3。
 */
export function usageTuples(
  records: { quantity: number; unitPrice: number | null }[],
  cap = 6,
): UsageTuple[] {
  const tuples: UsageTuple[] = [];
  for (const r of [...records].reverse()) {
    if (!tuples.some((t) => t.quantity === r.quantity && t.unitPrice === r.unitPrice)) {
      tuples.push({ quantity: r.quantity, unitPrice: r.unitPrice });
    }
  }
  return tuples.slice(0, cap);
}
