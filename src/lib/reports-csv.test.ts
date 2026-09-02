// CSV 组装测试（reports-redo ticket 04）：列序、转义、BOM、空区间、null 金额。

import { describe, expect, it } from "vitest";
import { itemsCsv, paymentsCsv } from "./reports-csv";
import type { ReportItem, ReportPayment } from "./reports";

const items: ReportItem[] = [
  { kind: "sub", id: "s1", name: "音乐,会员", category: "娱乐", cost: 120, daily: 4, share: 0.6 },
  { kind: "purchase", id: "p1", name: '键盘 "Pro"', category: "设备", cost: 80, daily: 2.67, share: 0.4 },
];

const payments: ReportPayment[] = [
  { date: "2026-08-01", name: "音乐,会员", amount: 68, currency: "CNY", amountBase: 68 },
  { date: "2026-08-15", name: '云盘 "Plus"', amount: null, currency: "USD", amountBase: 30.5 },
];

describe("itemsCsv", () => {
  it("列序与页面明细表一致，金额两位小数无千分位", () => {
    const csv = itemsCsv(items);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("名称,类型,分类,摊销成本,日均,占比%");
    expect(lines[1]).toBe('"音乐,会员",订阅,娱乐,120.00,4.00,60.00');
    expect(lines[2]).toBe('"键盘 ""Pro""",物品,设备,80.00,2.67,40.00');
  });

  it("空区间只出表头", () => {
    expect(itemsCsv([])).toBe("\uFEFF名称,类型,分类,摊销成本,日均,占比%\r\n");
  });

  it("金额无千分位（对账可直接求和）", () => {
    const csv = itemsCsv([{ kind: "sub", id: "s2", name: "年付", category: "云", cost: 1234.5, daily: 41.15, share: 1 }]);
    expect(csv.slice(1).split("\r\n")[1]).toBe("年付,订阅,云,1234.50,41.15,100.00");
  });
});

describe("paymentsCsv", () => {
  it("列序、升序保留、null 原币金额留空", () => {
    const csv = paymentsCsv(payments);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("日期,名称,原币金额,币种,折算主币金额");
    expect(lines[1]).toBe('2026-08-01,"音乐,会员",68.00,CNY,68.00');
    expect(lines[2]).toBe('2026-08-15,"云盘 ""Plus""",,USD,30.50');
  });

  it("空区间只出表头", () => {
    expect(paymentsCsv([])).toBe("\uFEFF日期,名称,原币金额,币种,折算主币金额\r\n");
  });
});

describe("BOM", () => {
  it("两个 CSV 均以 UTF-8 BOM 开头", () => {
    expect(itemsCsv(items).charCodeAt(0)).toBe(0xfeff);
    expect(paymentsCsv(payments).charCodeAt(0)).toBe(0xfeff);
  });
});
