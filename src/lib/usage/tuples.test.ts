import { describe, expect, it } from "vitest";
import { usageTuples } from "./tuples";

const rec = (quantity: number, unitPrice: number | null = null) => ({ quantity, unitPrice });

describe("usageTuples", () => {
  it("空历史返回空数组", () => {
    expect(usageTuples([])).toEqual([]);
  });

  it("全历史去重、最近优先", () => {
    const rows = [rec(1), rec(2, 39), rec(1), rec(4, 10), rec(2, 39)];
    expect(usageTuples(rows)).toEqual([
      { quantity: 2, unitPrice: 39 },
      { quantity: 4, unitPrice: 10 },
      { quantity: 1, unitPrice: null },
    ]);
  });

  it("quantity 相同但 unitPrice 不同算不同元组（严格相等）", () => {
    const rows = [rec(1, null), rec(1, 30)];
    expect(usageTuples(rows)).toEqual([
      { quantity: 1, unitPrice: 30 },
      { quantity: 1, unitPrice: null },
    ]);
  });

  it("cap 截断且保持最近优先顺序", () => {
    const rows = [rec(1), rec(2), rec(3), rec(4), rec(5)];
    expect(usageTuples(rows, 3)).toEqual([rec(5), rec(4), rec(3)]);
    expect(usageTuples(rows, 99)).toHaveLength(5);
  });
});
