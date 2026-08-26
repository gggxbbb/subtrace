import { describe, expect, it } from "vitest";
import { monthRange, monthlyUsageAggregation } from "./monthly";

describe("monthlyUsageAggregation 按月聚合", () => {
  it("月分组与 Σ：同月多行合并 count 与 total", () => {
    const rows = [
      { date: "2026-08-01", quantity: 1 },
      { date: "2026-08-15", quantity: 2 },
      { date: "2026-07-20", quantity: 3 },
    ];
    expect(monthlyUsageAggregation(rows)).toEqual([
      { month: "2026-08", count: 2, total: 3 },
      { month: "2026-07", count: 1, total: 3 },
    ]);
  });

  it("月降序：输入乱序输出仍按月份新到旧", () => {
    const rows = [
      { date: "2026-01-10", quantity: 1 },
      { date: "2026-08-01", quantity: 1 },
      { date: "2026-05-01", quantity: 1 },
    ];
    expect(monthlyUsageAggregation(rows).map((m) => m.month)).toEqual(["2026-08", "2026-05", "2026-01"]);
  });

  it("跨受益人合并：函数不管 userId 自然聚到同一月", () => {
    const rows: { userId: string; date: string; quantity: number }[] = [
      { userId: "u1", date: "2026-08-01", quantity: 1 },
      { userId: "u2", date: "2026-08-02", quantity: 2 },
    ];
    expect(monthlyUsageAggregation(rows)).toEqual([{ month: "2026-08", count: 2, total: 3 }]);
  });

  it("省钱型同路径：quantity 即已省金额，total 直接求和", () => {
    const rows = [
      { date: "2026-08-01", quantity: 12.5 },
      { date: "2026-08-20", quantity: 7.5 },
    ];
    expect(monthlyUsageAggregation(rows)).toEqual([{ month: "2026-08", count: 2, total: 20 }]);
  });

  it("空数组 → 空聚合", () => {
    expect(monthlyUsageAggregation([])).toEqual([]);
  });

  it("跨年分桶不错位：2025-12 与 2026-01 各归各月", () => {
    const rows = [
      { date: "2025-12-31", quantity: 1 },
      { date: "2026-01-01", quantity: 1 },
    ];
    expect(monthlyUsageAggregation(rows)).toEqual([
      { month: "2026-01", count: 1, total: 1 },
      { month: "2025-12", count: 1, total: 1 },
    ]);
  });
});

describe("monthRange 月份首末日", () => {
  it("普通月：首日到月末", () => {
    expect(monthRange("2026-08")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(monthRange("2026-04")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("跨年：2025-12 月末不回绕到同年", () => {
    expect(monthRange("2025-12")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("闰二月 29 天、平二月 28 天", () => {
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
