// 仓储缝测试：物品与回本模型（ticket 04）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { breakevenProgress, purchaseCurrentDailyRate, purchaseDailyRate } from "../cost-engine";
import {
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
