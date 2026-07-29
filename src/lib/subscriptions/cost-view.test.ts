// 订阅成本视图（cost-assembly 01）接口测试：DB fixture，仓储缝。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createSubscription, getSubscription, listSubscriptions, recordPayment } from "./service";
import { createPurchase, listPurchases } from "../purchases/service";
import { addBeneficiary } from "../beneficiaries/service";
import { costOverPeriod, costView, paidInPeriod, paidNet } from "./cost-view";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

let ownerId: string;
let otherId: string;

beforeEach(async () => {
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
  otherId = (await prisma.user.create({ data: { username: "other", passwordHash: "x" } })).id;
});

const cycleInput = {
  name: "哔哩哔哩大会员",
  trackingMode: "CYCLE" as const,
  cycleKind: "CALENDAR" as const,
  cycleUnit: "MONTH" as const,
  cycleCount: 1,
  listPrice: 25,
  listCurrency: "CNY",
  listPriceBase: 25,
  startDate: d("2026-01-15"),
};

const viewOf = async (subId: string, viewerId: string, today: Date) => {
  const sub = (await getSubscription(viewerId, subId))!;
  return costView(sub, viewerId, today);
};

describe("paidNet / paidInPeriod", () => {
  it("净额三态：正常 / 退款 / 金额未知", () => {
    expect(paidNet({ amountBase: 100, refundedBase: 0 })).toBe(100);
    expect(paidNet({ amountBase: 100, refundedBase: 30 })).toBe(70);
    expect(paidNet({ amountBase: null, refundedBase: 0 })).toBe(0);
  });

  it("区间聚合按支付日过滤（日界归一）", () => {
    const payments = [
      { amountBase: 100, refundedBase: 0, paidAt: d("2026-01-05") },
      { amountBase: 50, refundedBase: 10, paidAt: d("2026-02-01") },
      { amountBase: 999, refundedBase: 0, paidAt: d("2025-12-31") },
    ];
    const jan = paidInPeriod(payments, d("2026-01-01").getTime(), d("2026-02-01").getTime());
    expect(jan).toBe(100);
  });
});

describe("costView 点视图", () => {
  it("付费段覆盖今日：covering/费率/到期日/份额", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: 25,
      currency: "CNY",
      amountBase: 25,
      paidAt: d("2026-01-15"),
      periodStart: d("2026-01-15"),
      periodEnd: d("2026-02-15"),
      source: "AUTO",
    });
    const v = await viewOf(sub.id, ownerId, d("2026-02-01"));
    expect(v.expiry).toEqual(d("2026-02-15"));
    expect(v.covering).toHaveLength(1);
    expect(v.dailyRate).toBeCloseTo(25 / 31);
    expect(v.share).toBe(1);
    expect(v.myDailyRate).toBeCloseTo(25 / 31);
    expect(v.costUnknown).toBe(false);
    expect(v.estimatedRows).toHaveLength(0);
  });

  it("记录止期已过：推算段覆盖今日并出现在 estimatedRows", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: 25,
      currency: "CNY",
      amountBase: 25,
      paidAt: d("2026-01-15"),
      periodStart: d("2026-01-15"),
      periodEnd: d("2026-02-15"),
      source: "AUTO",
    });
    const v = await viewOf(sub.id, ownerId, d("2026-03-01"));
    expect(v.covering.every((s) => s.estimated)).toBe(true);
    expect(v.dailyRate).toBeCloseTo(25 / 28); // 2/15 → 3/15 推算段 28 天
    expect(v.estimatedRows.length).toBeGreaterThan(0);
    expect(v.estimatedRows[0].net).toBe(25);
  });

  it("金额未知段：costUnknown 为 true 且费率 0", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: null,
      currency: null,
      amountBase: null,
      paidAt: d("2026-01-15"),
      periodStart: d("2026-01-15"),
      periodEnd: d("2026-02-15"),
      source: "MANUAL",
    });
    const v = await viewOf(sub.id, ownerId, d("2026-02-01"));
    expect(v.costUnknown).toBe(true);
    expect(v.dailyRate).toBe(0);
  });

  it("共享订阅：所有者与受益用户各切一半（ADR-0003）", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: 100,
      currency: "CNY",
      amountBase: 100,
      paidAt: d("2026-01-15"),
      periodStart: d("2026-01-15"),
      periodEnd: d("2026-02-15"),
      source: "AUTO",
    });
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId, weight: 1 });
    const owner = await viewOf(sub.id, ownerId, d("2026-02-01"));
    const member = await viewOf(sub.id, otherId, d("2026-02-01"));
    expect(owner.share).toBeCloseTo(0.5);
    expect(owner.myDailyRate).toBeCloseTo((100 / 31) * 0.5);
    expect(member.share).toBeCloseTo(0.5);
    expect(member.myDailyRate).toBeCloseTo((100 / 31) * 0.5);
    // 全额费率不随视角变化
    expect(member.dailyRate).toBeCloseTo(100 / 31);
  });
});

describe("costOverPeriod 区间视图", () => {
  it("段算一次按天切片：订阅段 ∩ 区间折算，物品逐日费率", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: 25,
      currency: "CNY",
      amountBase: 25,
      paidAt: d("2026-01-15"),
      periodStart: d("2026-01-15"),
      periodEnd: d("2026-02-15"),
      source: "AUTO",
    });
    await createPurchase(ownerId, {
      name: "耳机",
      amount: 300,
      currency: "CNY",
      amountBase: 300,
      purchaseDate: d("2026-01-10"),
      expectedDays: 30,
    });
    const subs = await listSubscriptions(ownerId);
    const purchases = await listPurchases(ownerId);
    const jan = costOverPeriod({
      subs,
      purchases,
      viewerId: ownerId,
      startMs: d("2026-01-01").getTime(),
      endMs: d("2026-02-01").getTime(),
    });
    expect(jan.days).toHaveLength(31);
    // 订阅：1/15→2/1 共 17 天 × 25/31；物品：1/10→2/1 共 22 天 × 300/30
    expect(jan.totalAmortized).toBeCloseTo(17 * (25 / 31) + 22 * 10);
    expect(jan.days[8].cost).toBe(0);
    expect(jan.days[9].cost).toBeCloseTo(10);
    expect(jan.days[14].cost).toBeCloseTo(10 + 25 / 31);
    expect(jan.byCategory.find((c) => c.name === "物品")?.cost).toBeCloseTo(220);
    expect(jan.byItem.find((i) => i.kind === "sub")?.cost).toBeCloseTo(17 * (25 / 31));
  });
});
