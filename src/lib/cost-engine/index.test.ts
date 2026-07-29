// 成本引擎测试缝（纯函数模块，无 DB/框架依赖）。
// 每条测试对应 CONTEXT.md / ADR-0001~0004 中的一条可观察规则。

import { describe, expect, it } from "vitest";
import {
  actualCostPerUse,
  allocateBundle,
  breakevenProgress,
  costSegments,
  currentDailyRate,
  currentExpiry,
  dayDiff,
  purchaseCurrentDailyRate,
  purchaseDailyRate,
  segmentDailyRate,
  usageInPeriod,
  usageValue,
  verdict,
  type CycleSpec,
  type PaymentRec,
  type PurchaseDef,
  type SubscriptionDef,
} from "./index";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

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

describe("重叠成本段", () => {
  it("多条段覆盖同一天时费率为各段之和（提前续费区间交叠）", () => {
    const sub = cycleSub({ cycle: { kind: "calendar", unit: "year", count: 1 }, listPriceBase: 160 });
    const payments = [
      payment({ amountBase: 160, periodStart: d("2021-01-01"), periodEnd: d("2022-01-01") }),
      payment({ amountBase: 80, paidAt: d("2021-02-16"), periodStart: d("2021-02-16"), periodEnd: d("2022-02-16") }),
    ];
    // 只有第一段
    expect(currentDailyRate(sub, payments, d("2021-01-15"))).toBeCloseTo(160 / 365);
    // 两段叠加
    expect(currentDailyRate(sub, payments, d("2021-06-01"))).toBeCloseTo(160 / 365 + 80 / 365);
    // 只剩第二段
    expect(currentDailyRate(sub, payments, d("2022-01-15"))).toBeCloseTo(80 / 365);
  });
});

describe("联合会员分摊（ADR-0002）", () => {
  it("按子会员标准价比例分摊打包实付", () => {
    // 88VIP 88 元：优酷年卡原价 198、网易云 99
    const [a, b] = allocateBundle(88, [198, 99]);
    expect(a).toBeCloseTo(88 * (198 / 297));
    expect(b).toBeCloseTo(88 * (99 / 297));
    expect(a + b).toBeCloseTo(88);
  });

  it("原价未知的子会员按 0 参与，只摊已知原价部分", () => {
    const [known, unknown] = allocateBundle(88, [198, 0]);
    expect(known).toBeCloseTo(88);
    expect(unknown).toBe(0);
  });

  it("全部未知原价时不产生分摊", () => {
    expect(allocateBundle(88, [0, 0])).toEqual([0, 0]);
  });
});

describe("用量聚合", () => {
  const rec = (date: string, quantity: number, kind: "DELTA" | "TOTAL" = "DELTA") => ({
    date: d(date), quantity, kind,
  });

  it("计数型：区间内增量求和，区间外不计", () => {
    const records = [rec("2026-07-01", 1), rec("2026-07-10", 2), rec("2026-08-01", 5)];
    expect(usageInPeriod(records, d("2026-07-01"), d("2026-08-01"))).toBe(3);
  });

  it("额度型：取区间内最新快照", () => {
    const records = [rec("2026-07-05", 30, "TOTAL"), rec("2026-07-15", 65, "TOTAL")];
    expect(usageInPeriod(records, d("2026-07-01"), d("2026-08-01"))).toBe(65);
  });

  it("有快照时以快照为准，不再叠加增量", () => {
    const records = [rec("2026-07-02", 3), rec("2026-07-15", 50, "TOTAL")];
    expect(usageInPeriod(records, d("2026-07-01"), d("2026-08-01"))).toBe(50);
  });
});

describe("用量价值（单价跟记录走）", () => {
  const rec = (date: string, quantity: number, unitPrice?: number, kind: "DELTA" | "TOTAL" = "DELTA") => ({
    date: d(date), quantity, kind, unitPrice,
  });

  it("每条记录可按本次单价计价，空单价回退默认替代单价", () => {
    const records = [rec("2026-07-01", 1, 30), rec("2026-07-10", 1, 40), rec("2026-07-12", 1)];
    // 30 + 40 + 25（默认）
    expect(usageValue(records, d("2026-07-01"), d("2026-08-01"), 25)).toBeCloseTo(95);
  });

  it("额度型快照也按快照上的本次单价计", () => {
    const records = [rec("2026-07-15", 800, 0.12, "TOTAL")];
    expect(usageValue(records, d("2026-07-01"), d("2026-08-01"), 0.1)).toBeCloseTo(96);
  });
});

describe("锚点即今天的推算段（off-by-one）", () => {
  it("今天创建的周期订阅：应推算出 [今天, +1周期) 段，当日费率 > 0", () => {
    const sub: SubscriptionDef = {
      trackingMode: "cycle",
      startDate: d("2026-07-19"),
      anchorDate: d("2026-07-19"),
      cycle: { kind: "calendar", unit: "month", count: 1 },
      listPriceBase: 114,
    };
    const segs = costSegments(sub, [], d("2026-07-19"));
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toEqual(d("2026-07-19"));
    expect(segs[0].end).toEqual(d("2026-08-19"));
    expect(currentDailyRate(sub, [], d("2026-07-19"))).toBeGreaterThan(0);
  });

  it("有付费记录时，止期=今天不覆盖（到期日当天起不再覆盖）", () => {
    const sub: SubscriptionDef = {
      trackingMode: "cycle",
      startDate: d("2026-06-19"),
      anchorDate: d("2026-06-19"),
      cycle: { kind: "calendar", unit: "month", count: 1 },
      listPriceBase: 114,
    };
    const payments = [{ amountBase: 114, refundedBase: 0, paidAt: d("2026-06-19"), periodStart: d("2026-06-19"), periodEnd: d("2026-07-19") }];
    const covering = costSegments(sub, payments, d("2026-07-19")).filter(
      (s) => s.start <= d("2026-07-19") && d("2026-07-19") < s.end,
    );
    expect(covering.filter((s) => !s.estimated)).toHaveLength(0);
  });
});

describe("追加费用事件（ticket 13）", () => {
  const base: PurchaseDef = {
    amountBase: 8000,
    purchaseDate: d("2026-01-01"),
    expectedDays: 800,
    status: "in_use",
  };

  it("净额 = 买入 + 追加 − 残值，共用同一摊销窗口", () => {
    // 手机 8000 + 维修 500 → 按 8500 / 800 天摊
    const r = purchaseDailyRate({ ...base, extraBase: 500 }, d("2026-06-01"));
    expect(r).toBeCloseTo(8500 / 800);
  });

  it("维修延长寿命：费率与回本进度按延长后窗口", () => {
    const r = purchaseDailyRate({ ...base, extraBase: 500, extraDays: 100 }, d("2026-06-01"));
    expect(r).toBeCloseTo(8500 / 900);
    expect(breakevenProgress({ ...base, extraDays: 100 }, d("2026-04-11"))).toBeCloseTo(100 / 900, 2);
  });

  it("残值从累计净额（含事件）扣除", () => {
    const r = purchaseDailyRate({ ...base, extraBase: 500, resaleBase: 1000 }, d("2026-06-01"));
    expect(r).toBeCloseTo((8000 + 500 - 1000) / 800);
  });
});

describe("金额未知的付费记录（ticket 12）", () => {
  const unknownPayment = (over: Partial<PaymentRec> = {}): PaymentRec => ({
    amountBase: null,
    refundedBase: 0,
    paidAt: d("2026-06-15"),
    periodStart: d("2026-06-15"),
    periodEnd: d("2026-07-15"),
    ...over,
  });

  it("未知金额照常决定到期日（记录驱动不变）", () => {
    const sub: SubscriptionDef = { trackingMode: "manual", startDate: d("2026-01-01") };
    expect(currentExpiry(sub, [unknownPayment()], d("2026-06-20"))).toEqual(d("2026-07-15"));
  });

  it("未知金额段费率为 0 且打 amountUnknown 标记", () => {
    const sub: SubscriptionDef = { trackingMode: "manual", startDate: d("2026-01-01") };
    const segs = costSegments(sub, [unknownPayment()], d("2026-06-20"));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ net: 0, amountUnknown: true });
    expect(segmentDailyRate(segs[0])).toBe(0);
    expect(currentDailyRate(sub, [unknownPayment()], d("2026-06-20"))).toBe(0);
  });

  it("已知段照常计费，未知段不稀释其费率（按段独立）", () => {
    const sub: SubscriptionDef = { trackingMode: "manual", startDate: d("2026-01-01") };
    const payments = [
      unknownPayment(),
      payment({ paidAt: d("2026-07-10"), periodStart: d("2026-07-15"), periodEnd: d("2026-08-15") }), // 25/31天
    ];
    const segs = costSegments(sub, payments, d("2026-07-20"));
    expect(segs.map((s) => s.amountUnknown ?? false)).toEqual([true, false]);
    expect(currentDailyRate(sub, payments, d("2026-06-20"))).toBe(0); // 未知段覆盖期
    expect(currentDailyRate(sub, payments, d("2026-07-20"))).toBeCloseTo(25 / 31); // 已知段覆盖期
  });

  it("周期模式的推算段不受未知记录影响：未知段之后仍按标准价推算", () => {
    const sub = cycleSub(); // 月付 25
    const segs = costSegments(sub, [unknownPayment({ periodEnd: d("2026-07-15") })], d("2026-07-20"));
    // 前向补齐（记录前的未记账周期按标准价）+ 未知段后的推算段
    const after = segs[segs.length - 1];
    expect(after).toMatchObject({ estimated: true, net: 25, start: d("2026-07-15"), end: d("2026-08-15") });
    expect(currentDailyRate(sub, [unknownPayment({ periodEnd: d("2026-07-15") })], d("2026-07-20"))).toBeCloseTo(25 / 31);
  });
});
