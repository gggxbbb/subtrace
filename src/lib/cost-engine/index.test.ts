// 成本引擎测试缝（纯函数模块，无 DB/框架依赖）。
// 每条测试对应 CONTEXT.md / ADR-0001~0004 中的一条可观察规则。

import { describe, expect, it } from "vitest";
import {
  actualCostPerUse,
  breakevenProgress,
  costSegments,
  currentDailyRate,
  currentExpiry,
  dayDiff,
  purchaseCurrentDailyRate,
  purchaseDailyRate,
  segmentDailyRate,
  shareOf,
  verdict,
  type CycleSpec,
  type PaymentRec,
  type SubscriptionDef,
} from "./index";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const monthlyCycle: CycleSpec = { kind: "calendar", unit: "month", count: 1 };

const cycleSub = (over: Partial<SubscriptionDef> = {}): SubscriptionDef => ({
  trackingMode: "cycle",
  startDate: d("2026-01-15"),
  anchorDate: d("2026-01-15"),
  cycle: monthlyCycle,
  listPriceBase: 25,
  ...over,
});

const payment = (over: Partial<PaymentRec> = {}): PaymentRec => ({
  amountBase: 25,
  refundedBase: 0,
  paidAt: d("2026-06-15"),
  periodStart: d("2026-06-15"),
  periodEnd: d("2026-07-15"),
  ...over,
});

describe("到期日（ADR-0001：记录驱动 + 推算兜底）", () => {
  it("有付费记录时，到期日 = 最后一笔付费的服务止期", () => {
    const sub = cycleSub();
    const payments = [
      payment({ periodEnd: d("2026-07-15") }),
      payment({ paidAt: d("2026-07-10"), periodStart: d("2026-07-15"), periodEnd: d("2026-08-15") }),
    ];
    expect(currentExpiry(sub, payments, d("2026-07-18"))).toEqual(d("2026-08-15"));
  });

  it("提前手动续费会顺延到期日（B站场景：到账时长不固定）", () => {
    const sub = cycleSub({ cycle: { kind: "calendar", unit: "year", count: 1 } });
    // 自动扣费前手动续了一年活动价，实际到账 370 天
    const payments = [payment({ periodEnd: d("2027-07-20") })];
    expect(currentExpiry(sub, payments, d("2026-07-18"))).toEqual(d("2027-07-20"));
  });

  it("无付费记录时，推算锚定日期 + k×周期 中第一个 ≥ 今天的日期", () => {
    const sub = cycleSub();
    // 锚 1/15 月付：候选 2/15、3/15…；7/18 → 8/15
    expect(currentExpiry(sub, [], d("2026-07-18"))).toEqual(d("2026-08-15"));
    // 恰好当天也算未到期
    expect(currentExpiry(sub, [], d("2026-07-15"))).toEqual(d("2026-07-15"));
  });

  it("日历月付锚定原始日：1月31日起月付，2月取月末，3月回到31日", () => {
    const sub = cycleSub({ anchorDate: d("2026-01-31"), startDate: d("2026-01-31") });
    expect(currentExpiry(sub, [], d("2026-02-01"))).toEqual(d("2026-02-28"));
    expect(currentExpiry(sub, [], d("2026-03-01"))).toEqual(d("2026-03-31"));
    expect(currentExpiry(sub, [], d("2026-04-01"))).toEqual(d("2026-04-30"));
    expect(currentExpiry(sub, [], d("2026-05-01"))).toEqual(d("2026-05-31"));
  });

  it("固定天数周期按天数推进", () => {
    const sub = cycleSub({
      anchorDate: d("2026-07-01"),
      startDate: d("2026-07-01"),
      cycle: { kind: "fixedDays", days: 30 },
    });
    expect(currentExpiry(sub, [], d("2026-07-18"))).toEqual(d("2026-07-31"));
    expect(currentExpiry(sub, [], d("2026-08-05"))).toEqual(d("2026-08-30"));
  });

  it("手动模式无付费记录时没有到期日", () => {
    const sub: SubscriptionDef = { trackingMode: "manual", startDate: d("2026-01-01") };
    expect(currentExpiry(sub, [], d("2026-07-18"))).toBeNull();
  });
});

describe("成本段（ADR-0001/0004：付费净额 + 未记账按标准价补齐）", () => {
  it("付费记录生成段，净额 = 实付 − 退款（快照金额，与原币和当前汇率无关）", () => {
    const sub = cycleSub();
    const segs = costSegments(sub, [payment({ amountBase: 148, refundedBase: 48 })], d("2026-06-20"));
    const recorded = segs.filter((s) => !s.estimated);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].net).toBe(100);
    expect(recorded[0].start).toEqual(d("2026-06-15"));
    expect(recorded[0].end).toEqual(d("2026-07-15"));
  });

  it("周期模式无记录时，从锚定日期按周期生成标准价估算段直到覆盖今天", () => {
    const sub = cycleSub(); // 锚 1/15 月付 25 元
    const segs = costSegments(sub, [], d("2026-03-20"));
    expect(segs.map((s) => [s.start, s.end, s.net, s.estimated])).toEqual([
      [d("2026-01-15"), d("2026-02-15"), 25, true],
      [d("2026-02-15"), d("2026-03-15"), 25, true],
      [d("2026-03-15"), d("2026-04-15"), 25, true],
    ]);
  });

  it("付费记录止期之后的区间按标准价补齐（锚点被记录改写）", () => {
    const sub = cycleSub(); // 锚 1/15，但记录到 7/15 止
    const segs = costSegments(sub, [payment()], d("2026-08-20"));
    const after = segs.filter((s) => s.estimated && dayDiff(d("2026-07-15"), s.start) >= 0);
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({ start: d("2026-07-15"), end: d("2026-08-15"), net: 25 });
    expect(after[1]).toMatchObject({ start: d("2026-08-15"), end: d("2026-09-15"), net: 25 });
  });

  it("手动模式只产生付费记录段，不生成估算段", () => {
    const sub: SubscriptionDef = { trackingMode: "manual", startDate: d("2026-01-01") };
    expect(costSegments(sub, [payment()], d("2026-08-20"))).toHaveLength(1);
    expect(costSegments(sub, [], d("2026-08-20"))).toHaveLength(0);
  });

  it("日费率 = 段净额 / 覆盖天数", () => {
    expect(segmentDailyRate({ net: 100, start: d("2026-06-15"), end: d("2026-07-15"), estimated: false })).toBeCloseTo(100 / 30);
  });

  it("当日费率：今天落在付费段用净额，落在估算段用标准价，过期为 0", () => {
    const sub = cycleSub();
    // 落在付费段：100 / 30 天
    expect(currentDailyRate(sub, [payment({ amountBase: 148, refundedBase: 48 })], d("2026-06-20"))).toBeCloseTo(100 / 30);
    // 无记录落在估算段：25 / 31 天（1/15–2/15）
    expect(currentDailyRate(sub, [], d("2026-01-20"))).toBeCloseTo(25 / 31);
    // 手动模式无覆盖
    const manual: SubscriptionDef = { trackingMode: "manual", startDate: d("2026-01-01") };
    expect(currentDailyRate(manual, [payment()], d("2026-08-20"))).toBe(0);
  });
});

describe("物品回本模型", () => {
  const laptop = (over: Record<string, unknown> = {}) => ({
    amountBase: 1000,
    purchaseDate: d("2026-01-01"),
    expectedDays: 730,
    status: "in_use" as const,
    ...over,
  });

  it("预期寿命内按固定费率：金额 / 寿命天数", () => {
    expect(purchaseDailyRate(laptop(), d("2026-04-10"))).toBeCloseTo(1000 / 730);
  });

  it("超过预期寿命还在用，改摊到今天（费率递减）", () => {
    expect(purchaseDailyRate(laptop(), d("2027-12-31"))).toBeCloseTo(1000 / dayDiff(d("2026-01-01"), d("2027-12-31")));
  });

  it("未定寿命直接摊到今天", () => {
    expect(purchaseDailyRate(laptop({ expectedDays: undefined, amountBase: 1800 }), d("2026-07-01"))).toBeCloseTo(1800 / dayDiff(d("2026-01-01"), d("2026-07-01")));
  });

  it("卖出扣除残值并摊至卖出日", () => {
    const p = laptop({ status: "sold", endDate: d("2026-06-01"), resaleBase: 300 });
    expect(purchaseDailyRate(p, d("2026-07-18"))).toBeCloseTo(700 / dayDiff(d("2026-01-01"), d("2026-06-01")));
  });

  it("已卖出/报废的物品不再产生当日成本", () => {
    expect(purchaseCurrentDailyRate(laptop({ status: "sold", endDate: d("2026-06-01"), resaleBase: 300 }), d("2026-07-18"))).toBe(0);
    expect(purchaseCurrentDailyRate(laptop(), d("2026-04-10"))).toBeCloseTo(1000 / 730);
  });

  it("回本进度 = 已持有天数 / 预期寿命（封顶 1）", () => {
    expect(breakevenProgress(laptop(), d("2027-01-01"))).toBeCloseTo(365 / 730);
    expect(breakevenProgress(laptop(), d("2028-01-01"))).toBe(1);
    expect(breakevenProgress(laptop({ expectedDays: undefined }), d("2027-01-01"))).toBeUndefined();
  });
});

describe("受益人分摊（ADR-0003：单一实体，查询时按权重切片）", () => {
  const weights = [
    { userId: "me", weight: 1 },
    { userId: "spouse", weight: 1 },
  ];

  it("默认均分：相等权重各分一半", () => {
    expect(shareOf(248, weights, "me")).toBeCloseTo(124);
  });

  it("自定义权重按比例分", () => {
    const w = [
      { userId: "me", weight: 2 },
      { userId: "spouse", weight: 1 },
      { userId: "kid", weight: 1 },
    ];
    expect(shareOf(248, w, "me")).toBeCloseTo(124);
    expect(shareOf(248, w, "kid")).toBeCloseTo(62);
  });

  it("改权重全局重算：同一段成本按新权重立即生效", () => {
    const before = shareOf(248, weights, "me");
    const after = shareOf(248, [{ userId: "me", weight: 1 }, { userId: "spouse", weight: 3 }], "me");
    expect(after).toBeCloseTo(62);
    expect(after).not.toBeCloseTo(before);
  });
});

describe("用量盈亏（按服务区间、按人）", () => {
  it("盈亏 = 用量 × 替代单价 − 已摊成本", () => {
    expect(verdict(217, 9, 30)).toBeCloseTo(53); // 健身房：9 次 × 30 − 217
  });

  it("闲置子会员显示净亏", () => {
    expect(verdict(40, 0, 0)).toBeCloseTo(-40); // 88VIP 优酷分摊
  });

  it("每次实际成本 = 已摊 / 用量；无用量时为 null", () => {
    expect(actualCostPerUse(217, 9)).toBeCloseTo(217 / 9);
    expect(actualCostPerUse(40, 0)).toBeNull();
  });
});

describe("输入健壮性", () => {
  it("乱序的付费记录也按时间顺序生成成本段", () => {
    const sub = cycleSub();
    const late = payment({ paidAt: d("2026-07-10"), periodStart: d("2026-07-15"), periodEnd: d("2026-08-15") });
    const early = payment({ periodEnd: d("2026-07-15") });
    const segs = costSegments(sub, [late, early], d("2026-06-20"));
    const recorded = segs.filter((s) => !s.estimated);
    expect(recorded[0].end).toEqual(d("2026-07-15"));
    expect(recorded[1].start).toEqual(d("2026-07-15"));
  });
});

describe("成本段前向补齐", () => {
  it("首笔付费之前的未记账周期也按标准价补齐（从锚定日期起）", () => {
    const sub = cycleSub(); // 锚 1/15 月付 25
    // 第一笔记录从 3/15 才开始，1/15–3/15 两个周期未记账
    const segs = costSegments(sub, [payment({ periodStart: d("2026-03-15"), periodEnd: d("2026-04-15") })], d("2026-03-20"));
    expect(segs.map((s) => [s.start, s.net, s.estimated])).toEqual([
      [d("2026-01-15"), 25, true],
      [d("2026-02-15"), 25, true],
      [d("2026-03-15"), 25, false],
    ]);
  });
});

describe("前向补齐截断", () => {
  it("与首笔记录交叠的周期截断到记录起点，净额按天折算", () => {
    const sub = cycleSub(); // 锚 1/15 月付 25
    // 首笔记录 6/10 起：5/15→6/15 的周期与记录交叠，截断为 5/15→6/10
    const segs = costSegments(sub, [payment({ periodStart: d("2026-06-10"), periodEnd: d("2026-07-10") })], d("2026-06-11"));
    const estimated = segs.filter((s) => s.estimated);
    const last = estimated[estimated.length - 1];
    expect(last.end).toEqual(d("2026-06-10"));
    // 5/15→6/15 共 31 天，截断 5/15→6/10 共 26 天
    expect(last.net).toBeCloseTo(25 * (26 / 31));
  });
});
