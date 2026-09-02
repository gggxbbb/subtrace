// 仓储缝测试：报表装配（ticket 11）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { createSubscription } from "./subscriptions/service";
import { createPurchase } from "./purchases/service";
import { customRange, getReportData, monthRange, parseReportPeriod, yearRange } from "./reports";
import { setUsageConfig, addUsage } from "./usage/service";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

let ownerId: string;

beforeEach(async () => {
  await prisma.purchaseEvent.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
});

const pay = (subId: string, amount: number, start: string, end: string) =>
  prisma.payment.create({
    data: {
      subscriptionId: subId, amount, currency: "CNY", amountBase: amount,
      paidAt: d(start), periodStart: d(start), periodEnd: d(end), source: "MANUAL",
    },
  });

describe("月度报表", () => {
  it("订阅段按天折算入月 + 物品持有期逐日；分类占比与趋势", async () => {
    // 视频会员：07-01~08-01 ¥310（31 天，¥10/天）
    const sub = await createSubscription(ownerId, {
      name: "视频会员", category: "视频", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(sub.id, 310, "2026-07-01", "2026-08-01");
    // 工具会员：06-15~07-15 ¥300（30 天，¥10/天）——半个月跨 6/7 月
    const sub2 = await createSubscription(ownerId, {
      name: "工具会员", category: "工具", trackingMode: "MANUAL", startDate: d("2026-06-15"),
    });
    await pay(sub2.id, 300, "2026-06-15", "2026-07-15");
    // 物品：07-11 买入 ¥365，寿命 365 天 → ¥1/天，7 月持有 21 天
    await createPurchase(ownerId, {
      name: "键盘", amount: 365, currency: "CNY", amountBase: 365,
      purchaseDate: d("2026-07-11"), expectedDays: 365,
    });

    const { startMs, endMs } = monthRange(2026, 7);
    const r = await getReportData(ownerId, startMs, endMs, "2026-07");

    // 摊销：视频 310 + 工具 14×10 + 物品 21×1 = 471
    expect(r.totalAmortized).toBeCloseTo(310 + 140 + 21);
    const cat = Object.fromEntries(r.categories.map((c) => [c.name, c.cost]));
    expect(cat["视频"]).toBeCloseTo(310);
    expect(cat["工具"]).toBeCloseTo(140);
    expect(cat["物品"]).toBeCloseTo(21);
    // 趋势：07-01 = 视频10 + 工具10 + 物品0 = 20；07-15 起物品+1、工具结束
    expect(r.days.find((x) => x.date === "2026-07-01")!.cost).toBeCloseTo(20);
    expect(r.days.find((x) => x.date === "2026-07-16")!.cost).toBeCloseTo(11);
    expect(r.days).toHaveLength(31);
    // 实付：310（7月）+ 365（7月）= 675；工具的 300 在 6 月支付
    expect(r.totalPaid).toBeCloseTo(675);
  });
});

describe("年度报表", () => {
  it("段跨年正确切片", async () => {
    const sub = await createSubscription(ownerId, {
      name: "年会员", category: "视频", trackingMode: "MANUAL", startDate: d("2025-12-01"),
    });
    await pay(sub.id, 365, "2025-12-01", "2026-12-01"); // ¥1/天
    const { startMs, endMs } = yearRange(2026);
    const r = await getReportData(ownerId, startMs, endMs, "2026");
    // 2026 年覆盖 01-01~12-01 = 334 天
    expect(r.totalAmortized).toBeCloseTo(334);
    expect(r.days).toHaveLength(365);
  });
});

describe("订阅/物品拆分", () => {
  it("摊销与日均的拆分两列之和 = 总额", async () => {
    const sub = await createSubscription(ownerId, {
      name: "视频会员", category: "视频", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(sub.id, 310, "2026-07-01", "2026-08-01");
    await createPurchase(ownerId, {
      name: "键盘", amount: 365, currency: "CNY", amountBase: 365,
      purchaseDate: d("2026-07-11"), expectedDays: 365,
    });
    const { startMs, endMs } = monthRange(2026, 7);
    const r = await getReportData(ownerId, startMs, endMs, "2026-07");
    expect(r.subAmortized).toBeCloseTo(310);
    expect(r.itemAmortized).toBeCloseTo(21);
    expect(r.subAmortized + r.itemAmortized).toBeCloseTo(r.totalAmortized);
    expect(r.subDailyAvg).toBeCloseTo(310 / 31);
    expect(r.itemDailyAvg).toBeCloseTo(21 / 31);
    expect(r.subDailyAvg + r.itemDailyAvg).toBeCloseTo(r.dailyAvg);
  });
});

describe("双口径趋势序列", () => {
  it("62 天区间 → 逐日 62 桶，桶同时输出摊销与实付", async () => {
    const sub = await createSubscription(ownerId, {
      name: "视频会员", category: "视频", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(sub.id, 310, "2026-07-01", "2026-08-01");
    const { startMs, endMs } = customRange("2026-07-01", "2026-08-31")!; // 62 天
    const r = await getReportData(ownerId, startMs, endMs, "自定义");
    expect(r.trend).toHaveLength(62);
    expect(r.trend[0].label).toBe("2026-07-01");
    expect(r.trend[0].amortized).toBeCloseTo(10);
    expect(r.trend[0].paid).toBeCloseTo(310); // 支付日 07-01 落首桶
    expect(r.trend[30].amortized).toBeCloseTo(10);
    expect(r.trend[31].amortized).toBeCloseTo(0); // 段止 08-01 排他
    expect(r.trend.reduce((s, b) => s + b.amortized, 0)).toBeCloseTo(r.totalAmortized);
    expect(r.trend.reduce((s, b) => s + b.paid, 0)).toBeCloseTo(r.totalPaid);
  });

  it("63 天区间 → 逐周 9 桶（桶起日标签）", async () => {
    const { startMs, endMs } = customRange("2026-07-01", "2026-09-01")!; // 63 天
    const r = await getReportData(ownerId, startMs, endMs, "自定义");
    expect(r.trend).toHaveLength(9);
    expect(r.trend[0].label).toBe("2026-07-01");
    expect(r.trend[1].label).toBe("2026-07-08");
    expect(r.trend.reduce((s, b) => s + b.amortized, 0)).toBeCloseTo(r.totalAmortized);
  });

  it("211 天区间 → 逐月桶（week→month 边界）", async () => {
    const { startMs, endMs } = customRange("2026-01-01", "2026-07-30")!; // 211 天
    const r = await getReportData(ownerId, startMs, endMs, "自定义");
    expect(r.trend).toHaveLength(7);
    expect(r.trend[0].label).toBe("2026-01");
    expect(r.trend[6].label).toBe("2026-07");
  });

  it("年区间 → 逐月 12 桶（保持现状行为）", async () => {
    const { startMs, endMs } = yearRange(2026);
    const r = await getReportData(ownerId, startMs, endMs, "2026");
    expect(r.trend).toHaveLength(12);
    expect(r.trend[0].label).toBe("2026-01");
    expect(r.trend[11].label).toBe("2026-12");
  });
});

describe("用量回看板块", () => {
  it("区间内量化订阅出回看行：付了/用回/净盈亏/每次实际成本/倒计时 + 区间汇总", async () => {
    const sub = await createSubscription(ownerId, {
      name: "健身房", category: "运动", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(sub.id, 310, "2026-07-01", "2026-08-01");
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-10"), quantity: 3 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-20"), quantity: 2 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-08-10"), quantity: 5 }); // 区间外
    // 非量化订阅不出行
    const plain = await createSubscription(ownerId, {
      name: "纯订阅", category: "其他", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(plain.id, 100, "2026-07-01", "2026-08-01");

    const { startMs, endMs } = monthRange(2026, 7);
    const r = await getReportData(ownerId, startMs, endMs, "2026-07", d("2026-07-25"));
    expect(r.usageRows).toHaveLength(1);
    const row = r.usageRows[0];
    expect(row).toMatchObject({ id: sub.id, name: "健身房", kind: "COUNT", unit: "次", windowDays: 31 });
    expect(row.paid).toBeCloseTo(310);
    expect(row.value).toBe(150); // 5 次 × 30
    expect(row.net).toBeCloseTo(-160);
    expect(row.costPerUse).toBeCloseTo(62);
    expect(row.countdown).toEqual({ kind: "expiry", date: "2026-08-01", days: 7 });
    expect(r.usageTotal.paid).toBeCloseTo(310);
    expect(r.usageTotal.value).toBeCloseTo(150);
    expect(r.usageTotal.net).toBeCloseTo(-160);
    expect(r.usageTotal.hasUnknown).toBe(false);
  });

  it("区间内无成本覆盖且无记录：不出行；汇总为零", async () => {
    const sub = await createSubscription(ownerId, {
      name: "健身房", category: "运动", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(sub.id, 310, "2026-07-01", "2026-08-01");
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const { startMs, endMs } = monthRange(2026, 9); // 段外区间
    const r = await getReportData(ownerId, startMs, endMs, "2026-09", d("2026-07-25"));
    expect(r.usageRows).toEqual([]);
    expect(r.usageTotal).toEqual({ paid: 0, value: 0, net: 0, hasUnknown: false });
  });

  it("金额未知段覆盖：行保留并标 costUnknown，汇总标 hasUnknown", async () => {
    const sub = await createSubscription(ownerId, {
      name: "老订阅", category: "其他", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    // 金额未知：只有到期日没有金额（amountBase null）
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id, amount: null, currency: null, amountBase: null,
        paidAt: d("2026-07-01"), periodStart: d("2026-07-01"), periodEnd: d("2026-08-01"), source: "MANUAL",
      },
    });
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-10"), quantity: 2 });
    const { startMs, endMs } = monthRange(2026, 7);
    const r = await getReportData(ownerId, startMs, endMs, "2026-07", d("2026-07-25"));
    expect(r.usageRows).toHaveLength(1);
    expect(r.usageRows[0].costUnknown).toBe(true);
    expect(r.usageRows[0].value).toBe(60);
    expect(r.usageTotal.hasUnknown).toBe(true);
  });
});

describe("实付流水", () => {
  it("日期/名称/原币金额/币种/折算主币金额；Σ主币 = totalPaid", async () => {
    const sub = await createSubscription(ownerId, {
      name: "视频会员", category: "视频", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(sub.id, 310, "2026-07-01", "2026-08-01");
    await pay(sub.id, 300, "2026-06-01", "2026-07-01"); // 区间外
    const kb = await createPurchase(ownerId, {
      name: "键盘", amount: 365, currency: "CNY", amountBase: 365, purchaseDate: d("2026-07-11"),
    });
    await prisma.purchaseEvent.create({
      data: { purchaseId: kb.id, kind: "REPAIR", amount: 50, currency: "CNY", amountBase: 50, date: d("2026-07-20") },
    });
    const { startMs, endMs } = monthRange(2026, 7);
    const r = await getReportData(ownerId, startMs, endMs, "2026-07");
    expect(r.payments).toEqual([
      { date: "2026-07-01", name: "视频会员", amount: 310, currency: "CNY", amountBase: 310 },
      { date: "2026-07-11", name: "键盘", amount: 365, currency: "CNY", amountBase: 365 },
      { date: "2026-07-20", name: "键盘 · 维修", amount: 50, currency: "CNY", amountBase: 50 },
    ]);
    expect(r.payments.reduce((s, p) => s + p.amountBase, 0)).toBeCloseTo(r.totalPaid);
  });
});

describe("customRange / parseReportPeriod 区间解析", () => {
  it("customRange：止日含（endMs = 止日 +1 天，排他）", () => {
    expect(customRange("2026-07-01", "2026-07-31")).toEqual({
      startMs: d("2026-07-01").getTime(),
      endMs: d("2026-08-01").getTime(),
    });
    // 起 = 止 → 单日区间
    expect(customRange("2026-07-10", "2026-07-10")).toEqual({
      startMs: d("2026-07-10").getTime(),
      endMs: d("2026-07-11").getTime(),
    });
  });

  it("customRange：起 > 止、非法日期为 null", () => {
    expect(customRange("2026-08-01", "2026-07-01")).toBeNull();
    expect(customRange("2026-02-30", "2026-07-01")).toBeNull();
    expect(customRange("garbage", "2026-07-01")).toBeNull();
  });

  it("parseReportPeriod：月 / 年 / 自定义三档统一出口", () => {
    const now = d("2026-08-15");
    expect(parseReportPeriod("2026-08", now)).toEqual({
      kind: "month", period: "2026-08",
      startMs: d("2026-08-01").getTime(), endMs: d("2026-09-01").getTime(),
      label: "2026 年 8 月",
    });
    expect(parseReportPeriod("2026", now)).toEqual({
      kind: "year", period: "2026",
      startMs: d("2026-01-01").getTime(), endMs: d("2027-01-01").getTime(),
      label: "2026 年",
    });
    expect(parseReportPeriod("2026-07-01:2026-07-31", now)).toEqual({
      kind: "custom", period: "2026-07-01:2026-07-31",
      startMs: d("2026-07-01").getTime(), endMs: d("2026-08-01").getTime(),
      label: "2026-07-01 ~ 2026-07-31",
    });
  });
  it("parseReportPeriod：缺省回退当前月；非法/未来止期为 null", () => {
    const now = d("2026-08-15");
    expect(parseReportPeriod(undefined, now)).toMatchObject({ kind: "month", period: "2026-08" });
    expect(parseReportPeriod("garbage", now)).toBeNull();
    expect(parseReportPeriod("2026-13", now)).toBeNull();
    expect(parseReportPeriod("2026-07-01:2026-08-20", now)).toBeNull(); // 止期在未来
    expect(parseReportPeriod("2026-07-01:2026-08-15", now)).not.toBeNull(); // 止期 = 今天放行
  });
});
describe("边界区间", () => {
  it("空区间（start = end）：全零、无日切片、无趋势桶、无流水、无回看行", async () => {
    const ms = d("2026-07-01").getTime();
    const r = await getReportData(ownerId, ms, ms, "空");
    expect(r.totalAmortized).toBe(0);
    expect(r.totalPaid).toBe(0);
    expect(r.days).toEqual([]);
    expect(r.trend).toEqual([]);
    expect(r.payments).toEqual([]);
    expect(r.usageRows).toEqual([]);
  });

  it("单日区间：1 天切片、1 个趋势桶", async () => {
    const sub = await createSubscription(ownerId, {
      name: "视频会员", category: "视频", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await pay(sub.id, 310, "2026-07-01", "2026-08-01");
    const { startMs, endMs } = customRange("2026-07-10", "2026-07-10")!;
    const r = await getReportData(ownerId, startMs, endMs, "单日");
    expect(r.days).toHaveLength(1);
    expect(r.trend).toHaveLength(1);
    expect(r.totalAmortized).toBeCloseTo(10);
    expect(r.dailyAvg).toBeCloseTo(10);
  });
});
