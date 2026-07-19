// 仓储缝测试：物品与回本模型（ticket 04）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { breakevenProgress, purchaseCurrentDailyRate, purchaseDailyRate } from "../cost-engine";
import {
  subscriptionShareCost,
  closePurchase,
  createPurchase,
  getPurchase,
  listPurchases,
  toEnginePurchase,
} from "./service";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

let ownerId: string;
let otherId: string;

beforeEach(async () => {
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
  otherId = (await prisma.user.create({ data: { username: "other", passwordHash: "x" } })).id;
});

const laptopInput = {
  name: "MacBook Pro 14",
  category: "数码",
  amount: 14999,
  currency: "CNY",
  amountBase: 14999,
  purchaseDate: d("2024-11-02"),
  expectedDays: 1825,
};

describe("物品 CRUD", () => {
  it("可创建有/无预期寿命的物品", async () => {
    const withLife = await createPurchase(ownerId, laptopInput);
    expect(withLife.expectedDays).toBe(1825);
    const noLife = await createPurchase(ownerId, {
      name: "升降桌",
      amount: 1800,
      currency: "CNY",
      amountBase: 1800,
      purchaseDate: d("2023-04-20"),
    });
    expect(noLife.expectedDays).toBeNull();
  });

  it("列表按用户隔离", async () => {
    await createPurchase(ownerId, laptopInput);
    expect(await listPurchases(ownerId)).toHaveLength(1);
    expect(await listPurchases(otherId)).toHaveLength(0);
    const id = (await listPurchases(ownerId))[0].id;
    expect(await getPurchase(otherId, id)).toBeNull();
  });
});

describe("卖出/报废", () => {
  it("卖出登记终止摊销并记录残值", async () => {
    const p = await createPurchase(ownerId, laptopInput);
    await closePurchase(ownerId, p.id, {
      status: "SOLD",
      endDate: d("2026-06-01"),
      resaleBase: 8000,
    });
    const fresh = await getPurchase(ownerId, p.id);
    expect(fresh!.status).toBe("SOLD");
    expect(fresh!.endDate).toEqual(d("2026-06-01"));
    expect(fresh!.resaleBase).toBe(8000);
    // 回本模型：残值扣除、摊至卖出日、当日成本归零
    const engine = toEnginePurchase(fresh!);
    expect(purchaseDailyRate(engine, d("2026-07-18"))).toBeCloseTo(
      (14999 - 8000) / ((d("2026-06-01").getTime() - d("2024-11-02").getTime()) / 86_400_000),
    );
    expect(purchaseCurrentDailyRate(engine, d("2026-07-18"))).toBe(0);
  });

  it("报废无残值", async () => {
    const p = await createPurchase(ownerId, laptopInput);
    await closePurchase(ownerId, p.id, { status: "RETIRED", endDate: d("2026-06-01") });
    const fresh = await getPurchase(ownerId, p.id);
    expect(fresh!.status).toBe("RETIRED");
    expect(fresh!.resaleBase).toBeNull();
  });
});

describe("回本进度", () => {
  it("持有中物品返回已持有/寿命比例", async () => {
    const p = await createPurchase(ownerId, {
      name: "耳机",
      amount: 1000,
      currency: "CNY",
      amountBase: 1000,
      purchaseDate: d("2026-01-01"),
      expectedDays: 730,
    });
    expect(breakevenProgress(toEnginePurchase(p), d("2027-01-01"))).toBeCloseTo(365 / 730);
  });
});

describe("物品 TCO：订阅份额（ADR-0003）", () => {
  it("iPhone 作为 iCloud 受益人：份额 1/2，持有期整段覆盖", async () => {
    const { createSubscription } = await import("../subscriptions/service");
    const { addBeneficiary } = await import("../beneficiaries/service");
    const sub = await createSubscription(ownerId, {
      name: "iCloud+ 2TB", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id, amount: 217, currency: "CNY", amountBase: 217,
        paidAt: d("2026-07-01"), periodStart: d("2026-07-01"), periodEnd: d("2026-08-01"), source: "MANUAL",
      },
    });
    const iphone = await createPurchase(ownerId, {
      name: "iPhone 16", amount: 6000, currency: "CNY", amountBase: 6000, purchaseDate: d("2026-06-01"),
    });
    await addBeneficiary(ownerId, sub.id, { kind: "ITEM", purchaseId: iphone.id });
    const lines = await subscriptionShareCost(ownerId, iphone, d("2026-07-18"));
    expect(lines).toHaveLength(1);
    expect(lines[0].share).toBeCloseTo(0.5);
    // 截至今天 07-18：覆盖 17/31 天
    expect(lines[0].amount).toBeCloseTo(217 * (17 / 31) * 0.5, 1);
  });

  it("持有期只覆盖部分区间：按重叠天数折算", async () => {
    const { createSubscription } = await import("../subscriptions/service");
    const { addBeneficiary } = await import("../beneficiaries/service");
    const sub = await createSubscription(ownerId, {
      name: "iCloud+ 2TB", trackingMode: "MANUAL", startDate: d("2026-07-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id, amount: 217, currency: "CNY", amountBase: 217,
        paidAt: d("2026-07-01"), periodStart: d("2026-07-01"), periodEnd: d("2026-08-01"), source: "MANUAL",
      },
    });
    // 07-16 买入，截至今天 07-18：覆盖 2 天 / 31 天
    const ipad = await createPurchase(ownerId, {
      name: "iPad", amount: 4000, currency: "CNY", amountBase: 4000, purchaseDate: d("2026-07-16"),
    });
    await addBeneficiary(ownerId, sub.id, { kind: "ITEM", purchaseId: ipad.id });
    const lines = await subscriptionShareCost(ownerId, ipad, d("2026-07-18"));
    expect(lines[0].amount).toBeCloseTo(217 * (2 / 31) * 0.5, 1);
  });

  it("非受益物品无订阅份额", async () => {
    const desk = await createPurchase(ownerId, {
      name: "升降桌", amount: 2000, currency: "CNY", amountBase: 2000, purchaseDate: d("2026-01-01"),
    });
    expect(await subscriptionShareCost(ownerId, desk, d("2026-07-18"))).toHaveLength(0);
  });
});
