// 首页装配（reports-redo ticket 03）：当日日均拆分为订阅/物品两半，数字守恒。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { getDashboardData } from "./dashboard";
import { createSubscription } from "./subscriptions/service";
import { createPurchase } from "./purchases/service";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

let ownerId: string;

beforeEach(async () => {
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
});

describe("首页日均拆分", () => {
  it("订阅日均 + 物品日均 = 当日总日均", async () => {
    // 订阅：月付 ¥30 → 日均约 ¥1
    await createSubscription(ownerId, {
      name: "iCloud+",
      trackingMode: "CYCLE",
      cycleKind: "CALENDAR",
      cycleUnit: "MONTH",
      cycleCount: 1,
      listPrice: 30,
      listCurrency: "CNY",
      listPriceBase: 30,
      startDate: d("2026-07-01"),
    });
    // 物品：¥365 寿命 365 天 → ¥1/天
    await createPurchase(ownerId, {
      name: "键盘",
      amount: 365,
      currency: "CNY",
      amountBase: 365,
      purchaseDate: d("2026-07-01"),
      expectedDays: 365,
    });
    const data = await getDashboardData(ownerId);
    expect(data.subDailyCost).toBeCloseTo(1, 5);
    expect(data.itemDailyCost).toBeCloseTo(1, 5);
    expect(data.subDailyCost + data.itemDailyCost).toBeCloseTo(data.totalDailyCost, 10);
  });

  it("无物品时订阅日均等于总日均", async () => {
    await createSubscription(ownerId, {
      name: "iCloud+",
      trackingMode: "CYCLE",
      cycleKind: "CALENDAR",
      cycleUnit: "MONTH",
      cycleCount: 1,
      listPrice: 30.4,
      listCurrency: "CNY",
      listPriceBase: 30.4,
      startDate: d("2026-07-01"),
    });
    const data = await getDashboardData(ownerId);
    expect(data.itemDailyCost).toBe(0);
    expect(data.subDailyCost).toBeCloseTo(data.totalDailyCost, 10);
  });
});
