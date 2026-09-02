// 报表 CSV 组装（reports-redo ticket 04）：纯函数、可单测；路由层负责取数与响应头。
// 口径与页面明细表一致：items 降序、payments 升序；金额不带千分位、保留两位小数（对账可直接求和）。

import type { ReportItem, ReportPayment } from "./reports";

/** RFC 4180：含逗号/引号/换行的字段双引号包裹 + 引号双写 */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map((f) => csvField(String(f))).join(",");
}

function money(n: number): string {
  return n.toFixed(2);
}

/** 完整 CSV 文档：UTF-8 BOM 开头，Excel 打开中文不乱码 */
export function csvDocument(header: string[], rows: string[]): string {
  return "\uFEFF" + [csvRow(header), ...rows].join("\r\n") + "\r\n";
}

/** 明细.csv：名称/类型/分类/摊销成本/日均/占比%（items 降序、日均读装配层 it.daily，同页面明细表） */
export function itemsCsv(items: ReportItem[]): string {
  const rows = items.map((it) =>
    csvRow([
      it.name,
      it.kind === "sub" ? "订阅" : "物品",
      it.category,
      money(it.cost),
      money(it.daily),
      (it.share * 100).toFixed(2),
    ]),
  );
  return csvDocument(["名称", "类型", "分类", "摊销成本", "日均", "占比%"], rows);
}

/** 实付流水.csv：日期/名称/原币金额/币种/折算主币金额（payments 升序；amount 为 null 留空） */
export function paymentsCsv(payments: ReportPayment[]): string {
  const rows = payments.map((p) =>
    csvRow([p.date, p.name, p.amount == null ? "" : money(p.amount), p.currency, money(p.amountBase)]),
  );
  return csvDocument(["日期", "名称", "原币金额", "币种", "折算主币金额"], rows);
}
