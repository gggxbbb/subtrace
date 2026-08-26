/** 列表盈亏信号四态（ui-wave-a ticket 03）：盈 / 亏 / 成本未知（灰显）/ 未跟踪（"—"）。
 *  verdict 为 null = 未启用用量或当前无覆盖区间。金额 0 归入盈（账本口径 0 = 无浪费）。 */
export function pnlTone(
  verdict: { verdictAmount: number; costUnknown?: boolean } | null,
): "pos" | "neg" | "unknown" | "none" {
  if (!verdict) return "none";
  if (verdict.costUnknown) return "unknown";
  return verdict.verdictAmount >= 0 ? "pos" : "neg";
}
