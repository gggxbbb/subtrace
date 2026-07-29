// 金额格式化（ADR-0010）：主币种金额的唯一显示出口。
// 币种符号/分隔随传入币种；调用方传当前用户主币种（user.baseCurrency）。

export function fmtMoney(n: number, currency: string): string {
  return n.toLocaleString("zh-CN", { style: "currency", currency });
}
