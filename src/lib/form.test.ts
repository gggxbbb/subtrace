// 表单解析（cost-assembly 03）：dayField/numField 边界。

import { describe, expect, it } from "vitest";
import { parseDay } from "./dates";
import { dayField, numField } from "./form";

const fd = (v: string | null) => {
  const f = new FormData();
  if (v !== null) f.set("x", v);
  return f.get("x");
};

describe("numField", () => {
  it("空值/空串/非数 → undefined", () => {
    expect(numField(fd(null))).toBeUndefined();
    expect(numField(fd(""))).toBeUndefined();
    expect(numField(fd("   "))).toBeUndefined();
    expect(numField(fd("abc"))).toBeUndefined();
  });

  it("数字字符串 → 数值（含小数与负数）", () => {
    expect(numField(fd("7.25"))).toBe(7.25);
    expect(numField(fd("0"))).toBe(0);
    expect(numField(fd("-3"))).toBe(-3);
  });
});

describe("dayField", () => {
  it("日期字符串按北京墙钟构造（委托 parseDay，ADR-0008）", () => {
    expect(dayField(fd("2026-07-20"))).toEqual(parseDay("2026-07-20"));
    expect(dayField(fd("2026-07-20"))).toEqual(new Date("2026-07-19T16:00:00Z"));
  });
});
