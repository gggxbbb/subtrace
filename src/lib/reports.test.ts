// 仓储缝测试：报表装配（ticket 11）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { createSubscription } from "./subscriptions/service";
import { createPurchase } from "./purchases/service";
import { getReportData, monthRange, yearRange } from "./reports";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

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
