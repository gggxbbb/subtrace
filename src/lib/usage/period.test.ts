// 用量周期测试缝（纯函数模块，无 DB/框架依赖）。
// 对应 ticket 01：周期窗口派生与按段分摊的成本。

import { describe, expect, it } from "vitest";
import type { CostSegment, CycleSpec } from "../cost-engine";
import { currentUsagePeriod, periodCost, usagePeriods } from "./period";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

const monthly: CycleSpec = { kind: "calendar", unit: "month", count: 1 };
const weekly: CycleSpec = { kind: "calendar", unit: "week", count: 1 };
const yearly: CycleSpec = { kind: "calendar", unit: "year", count: 1 };

const seg = (start: Date, end: Date, over: Partial<CostSegment> = {}): CostSegment => ({
  net: 0,
  estimated: false,
  start,
  end,
  ...over,
});

describe("usagePeriods：周期窗口序列", () => {
  it("月度：从锚点逐月推进，截至覆盖 today 的周期", () => {
    expect([...usagePeriods(monthly, d("2026-08-21"), d("2026-10-05"))]).toEqual([
      { start: d("2026-08-21"), end: d("2026-09-21") },
      { start: d("2026-09-21"), end: d("2026-10-21") },
    ]);
  });

  it("月度：31 日锚点折叠（1/31 → 2/28 → 3/31 → 4/30）", () => {
    expect([...usagePeriods(monthly, d("2026-01-31"), d("2026-04-15"))]).toEqual([
      { start: d("2026-01-31"), end: d("2026-02-28") },
      { start: d("2026-02-28"), end: d("2026-03-31") },
      { start: d("2026-03-31"), end: d("2026-04-30") },
    ]);
  });

  it("年度：从锚点按年推进", () => {
    expect([...usagePeriods(yearly, d("2026-08-21"), d("2028-02-01"))]).toEqual([
      { start: d("2026-08-21"), end: d("2027-08-21") },
      { start: d("2027-08-21"), end: d("2028-08-21") },
    ]);
  });

  it("周度：按 7 天推进", () => {
    expect([...usagePeriods(weekly, d("2026-08-21"), d("2026-09-05"))]).toEqual([
      { start: d("2026-08-21"), end: d("2026-08-28") },
      { start: d("2026-08-28"), end: d("2026-09-04") },
      { start: d("2026-09-04"), end: d("2026-09-11") },
    ]);
  });

  it("today 早于 anchor 时为空", () => {
    expect([...usagePeriods(monthly, d("2026-08-21"), d("2026-07-01"))]).toEqual([]);
  });

  it("today 恰为锚点时只含首段（off-by-one）", () => {
    expect([...usagePeriods(monthly, d("2026-08-21"), d("2026-08-21"))]).toEqual([
      { start: d("2026-08-21"), end: d("2026-09-21") },
    ]);
  });

  it("today 恰为段止期时属于下一段（止期排他）", () => {
    expect([...usagePeriods(monthly, d("2026-08-21"), d("2026-09-21"))]).toEqual([
      { start: d("2026-08-21"), end: d("2026-09-21") },
      { start: d("2026-09-21"), end: d("2026-10-21") },
    ]);
  });
});

describe("currentUsagePeriod：覆盖 today 的当前周期", () => {
  it("today 在周期内 → 推进到覆盖它的周期", () => {
    expect(currentUsagePeriod(monthly, d("2026-08-21"), d("2026-10-05"))).toEqual({
      start: d("2026-09-21"),
      end: d("2026-10-21"),
    });
  });

  it("today 恰在锚点 → 首段", () => {
    expect(currentUsagePeriod(monthly, d("2026-08-21"), d("2026-08-21"))).toEqual({
      start: d("2026-08-21"),
      end: d("2026-09-21"),
    });
  });

  it("today 早于 anchor → null", () => {
    expect(currentUsagePeriod(monthly, d("2026-08-21"), d("2026-07-01"))).toBeNull();
  });
});

describe("periodCost：按段日费率分摊", () => {
  it("整段覆盖：净额 = 段净额", () => {
    const s = seg(d("2026-08-21"), d("2026-09-21"), { net: 300 }); // 30 天 × 10/天
    expect(periodCost([s], d("2026-08-21"), d("2026-09-21"))).toEqual({
      net: 300,
      amountUnknown: false,
      covered: true,
    });
  });

  it("部分覆盖：按相交天数折算", () => {
    const s = seg(d("2026-08-01"), d("2026-08-31"), { net: 300 }); // 30 天 × 10/天
    expect(periodCost([s], d("2026-08-11"), d("2026-08-21"))).toEqual({
      net: 100, // 相交 [08-11, 08-21) = 10 天 × 10/天
      amountUnknown: false,
      covered: true,
    });
  });

  it("无相交：净额 0 且 covered=false", () => {
    const s = seg(d("2026-08-21"), d("2026-09-21"), { net: 300 });
    expect(periodCost([s], d("2026-10-01"), d("2026-11-01"))).toEqual({
      net: 0,
      amountUnknown: false,
      covered: false,
    });
  });

  it("止期恰在窗口起点：不相交（[start, end) 排他）", () => {
    const s = seg(d("2026-08-21"), d("2026-09-01"), { net: 110 }); // 11 天 × 10/天
    expect(periodCost([s], d("2026-09-01"), d("2026-09-30"))).toEqual({
      net: 0,
      amountUnknown: false,
      covered: false,
    });
  });

  it("金额未知段：amountUnknown=true 且不计入成本", () => {
    const s = seg(d("2026-08-21"), d("2026-09-21"), {
      net: 0,
      amountUnknown: true,
      estimated: true,
    });
    expect(periodCost([s], d("2026-08-21"), d("2026-09-21"))).toEqual({
      net: 0,
      amountUnknown: true,
      covered: true,
    });
  });

  it("已知 + 未知段混合：只计入已知段，并标记未知", () => {
    const known = seg(d("2026-08-01"), d("2026-08-31"), { net: 300 }); // 30 天 × 10/天
    const unknown = seg(d("2026-08-15"), d("2026-09-15"), {
      net: 0,
      amountUnknown: true,
      estimated: true,
    });
    expect(periodCost([known, unknown], d("2026-08-11"), d("2026-08-31"))).toEqual({
      net: 200, // 已知段相交 [08-11, 08-31) = 20 天 × 10/天
      amountUnknown: true,
      covered: true,
    });
  });
});
