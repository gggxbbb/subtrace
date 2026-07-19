// 仓储缝测试：物品与回本模型（ticket 04）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { breakevenProgress, purchaseCurrentDailyRate, purchaseDailyRate } from "../cost-engine";
import {
  addPurchaseEvent,
  addPurchaseIncome,
  deletePurchaseEvent,
  listPurchaseEvents,
  updatePurchaseEvent,
  deletePurchaseIncome,
  listPurchaseIncomes,
  updatePurchase,
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
  it("iPhone 作为 iCloud 唯一受益人：份额 1，整段计入", async () => {
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
    // 唯一受益人 → 份额 1（物品受益不再自动补所有者行）
    expect(lines[0].share).toBeCloseTo(1);
    // 与持有期重叠即整段计入（不按天折算）
    expect(lines[0].amount).toBeCloseTo(217);
  });

  it("持有期与段有交集即整段计入（不按天折算）", async () => {
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
    // 07-16 买入：持有期与 07-01~08-01 段有交集 → 整段计入
    const ipad = await createPurchase(ownerId, {
      name: "iPad", amount: 4000, currency: "CNY", amountBase: 4000, purchaseDate: d("2026-07-16"),
    });
    await addBeneficiary(ownerId, sub.id, { kind: "ITEM", purchaseId: ipad.id });
    const lines = await subscriptionShareCost(ownerId, ipad, d("2026-07-18"));
    expect(lines[0].amount).toBeCloseTo(217);
  });

  it("非受益物品无订阅份额", async () => {
    const desk = await createPurchase(ownerId, {
      name: "升降桌", amount: 2000, currency: "CNY", amountBase: 2000, purchaseDate: d("2026-01-01"),
    });
    expect(await subscriptionShareCost(ownerId, desk, d("2026-07-18"))).toHaveLength(0);
  });
});

describe("物品收益与编辑", () => {
  it("可记录/删除收益，抵减 TCO", async () => {
    const p = await createPurchase(ownerId, {
      name: "相机", amount: 12000, currency: "CNY", amountBase: 12000, purchaseDate: d("2026-01-01"),
    });
    await addPurchaseIncome(ownerId, p.id, { amount: 300, date: d("2026-03-01"), note: "出租 3 天" });
    await addPurchaseIncome(ownerId, p.id, { amount: 200, date: d("2026-05-01"), note: "出租 2 天" });
    const incomes = await listPurchaseIncomes(p.id);
    expect(incomes).toHaveLength(2);
    expect(incomes.reduce((s, i) => s + i.amountBase, 0)).toBe(500);
    await deletePurchaseIncome(ownerId, incomes[0].id);
    expect(await listPurchaseIncomes(p.id)).toHaveLength(1);
  });

  it("创建后可编辑名称/金额/日期/寿命", async () => {
    const p = await createPurchase(ownerId, {
      name: "相机", amount: 12000, currency: "CNY", amountBase: 12000, purchaseDate: d("2026-01-01"),
    });
    await updatePurchase(ownerId, p.id, { name: "相机 A7M4", amountBase: 11500, expectedDays: 1500 });
    const fresh = await getPurchase(ownerId, p.id);
    expect(fresh!.name).toBe("相机 A7M4");
    expect(fresh!.amountBase).toBe(11500);
    expect(fresh!.expectedDays).toBe(1500);
  });
});

describe("归档与删除", () => {
  it("归档后从列表消失，删除后查无此物", async () => {
    const p = await createPurchase(ownerId, laptopInput);
    const { setPurchaseArchived, deletePurchase } = await import("./service");
    await setPurchaseArchived(ownerId, p.id, true);
    expect(await listPurchases(ownerId)).toHaveLength(0);
    await setPurchaseArchived(ownerId, p.id, false);
    expect(await listPurchases(ownerId)).toHaveLength(1);
    await deletePurchase(ownerId, p.id);
    expect(await getPurchase(ownerId, p.id)).toBeNull();
  });
});

describe("追加费用事件", () => {
  it("手机 8000 + 维修 500 → 净额 8500 按同窗口摊销", async () => {
    const p = await createPurchase(ownerId, {
      name: "手机", amount: 8000, currency: "CNY", amountBase: 8000,
      purchaseDate: d("2026-01-01"), expectedDays: 800,
    });
    await addPurchaseEvent(ownerId, p.id, {
      kind: "REPAIR", amount: 500, date: d("2026-03-01"), note: "换屏",
    });
    const fresh = await getPurchase(ownerId, p.id);
    expect(purchaseDailyRate(toEnginePurchase(fresh!), d("2026-06-01"))).toBeCloseTo(8500 / 800);
  });

  it("维修延长寿命 extendDays 联动费率与回本进度", async () => {
    const p = await createPurchase(ownerId, {
      name: "手机", amount: 8000, currency: "CNY", amountBase: 8000,
      purchaseDate: d("2026-01-01"), expectedDays: 800,
    });
    await addPurchaseEvent(ownerId, p.id, {
      kind: "REPAIR", amount: 500, date: d("2026-03-01"), extendDays: 100,
    });
    const fresh = await getPurchase(ownerId, p.id);
    const engine = toEnginePurchase(fresh!);
    expect(purchaseDailyRate(engine, d("2026-06-01"))).toBeCloseTo(8500 / 900);
    expect(breakevenProgress(engine, d("2026-04-11"))).toBeCloseTo(100 / 900, 2);
  });

  it("事件可编辑/删除，净额联动重算", async () => {
    const p = await createPurchase(ownerId, {
      name: "手机", amount: 8000, currency: "CNY", amountBase: 8000,
      purchaseDate: d("2026-01-01"), expectedDays: 800,
    });
    const ev = await addPurchaseEvent(ownerId, p.id, {
      kind: "ACCESSORY", amount: 300, date: d("2026-02-01"), note: "手机壳",
    });
    await updatePurchaseEvent(ownerId, ev.id, { amountBase: 200 });
    let fresh = await getPurchase(ownerId, p.id);
    expect(purchaseDailyRate(toEnginePurchase(fresh!), d("2026-06-01"))).toBeCloseTo(8200 / 800);
    await deletePurchaseEvent(ownerId, ev.id);
    fresh = await getPurchase(ownerId, p.id);
    expect(purchaseDailyRate(toEnginePurchase(fresh!), d("2026-06-01"))).toBeCloseTo(8000 / 800);
    expect(await listPurchaseEvents(p.id)).toHaveLength(0);
  });
});
