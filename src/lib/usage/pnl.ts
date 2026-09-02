/** 列表盈亏信号四态（ui-wave-a ticket 03）：盈 / 亏 / 未知灰显（成本未知或价值未知，ticket 04）/ 未跟踪（"—"）。
 *  verdict 为 null = 未启用用量或当前无覆盖区间。金额 0 归入盈（账本口径 0 = 无浪费）。 */
export function pnlTone(
  verdict: { verdictAmount: number; costUnknown?: boolean; valueUnknown?: boolean } | null,
): "pos" | "neg" | "unknown" | "none" {
  if (!verdict) return "none";
  if (verdict.costUnknown || verdict.valueUnknown) return "unknown";
  return verdict.verdictAmount >= 0 ? "pos" : "neg";
}
