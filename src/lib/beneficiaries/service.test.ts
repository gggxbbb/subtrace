// 受益实体（ticket 07）：用户（家庭共享）与物品（iCloud 之于多设备）按权重分摊。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  addBeneficiary,
  shareFor,
  shareForViewer,
  beneficiaryShares,
  listBeneficiaries,
  removeBeneficiary,
  setBeneficiaryWeight,
} from "./service";
import { createSubscription, getSubscription, listSubscriptions } from "../subscriptions/service";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

let ownerId: string;
let memberId: string;
let strangerId: string;
let subId: string;

beforeEach(async () => {
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
  memberId = (await prisma.user.create({ data: { username: "wife", passwordHash: "x" } })).id;
  strangerId = (await prisma.user.create({ data: { username: "stranger", passwordHash: "x" } })).id;
  const sub = await createSubscription(ownerId, {
    name: "iCloud+ 2TB",
    trackingMode: "CYCLE",
    cycleKind: "CALENDAR",
    cycleUnit: "MONTH",
    cycleCount: 1,
    listPrice: 21,
    listCurrency: "CNY",
    listPriceBase: 21,
    startDate: d("2026-07-01"),
  });
  subId = sub.id;
});

describe("添加受益实体", () => {
  it("首个受益人加入时自动补上所有者（权重 1，均分）", async () => {
    await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    const list = await listBeneficiaries(subId);
    expect(list).toHaveLength(2);
    const owner = list.find((b) => b.userId === ownerId);
    const member = list.find((b) => b.userId === memberId);
    expect(owner).toBeDefined();
    expect(member).toBeDefined();
    // 默认均分：各 1/2
    const shares = beneficiaryShares(list);
    expect(shares.find((s) => s.refId === ownerId)!.share).toBeCloseTo(0.5);
    expect(shares.find((s) => s.refId === memberId)!.share).toBeCloseTo(0.5);
  });

  it("重复添加同一用户拒绝", async () => {
    await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    await expect(
      addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId }),
    ).rejects.toThrow(/已存在|重复/);
  });

  it("权重必须为正数", async () => {
    await expect(
      addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId, weight: 0 }),
    ).rejects.toThrow(/权重/);
  });

  it("非所有者不能添加", async () => {
    await expect(
      addBeneficiary(memberId, subId, { kind: "USER", userId: strangerId }),
    ).rejects.toThrow(/权限|所有者/);
  });

  it("物品受益人必须是自己的物品", async () => {
    const othersPurchase = await prisma.purchase.create({
      data: {
        ownerId: memberId, name: "别人的 iPhone", amount: 6000, currency: "CNY",
        amountBase: 6000, purchaseDate: d("2026-01-01"),
      },
    });
    await expect(
      addBeneficiary(ownerId, subId, { kind: "ITEM", purchaseId: othersPurchase.id }),
    ).rejects.toThrow(/权限|物品/);
  });

  it("iCloud 场景：两台设备 1:1，不再自动补所有者", async () => {
    const mkItem = (name: string) =>
      prisma.purchase.create({
        data: { ownerId, name, amount: 5000, currency: "CNY", amountBase: 5000, purchaseDate: d("2026-01-01") },
      });
    const mac = await mkItem("MacBook");
    const iphone = await mkItem("iPhone");
    await addBeneficiary(ownerId, subId, { kind: "ITEM", purchaseId: mac.id });
    await addBeneficiary(ownerId, subId, { kind: "ITEM", purchaseId: iphone.id });
    const shares = beneficiaryShares(await listBeneficiaries(subId));
    expect(shares).toHaveLength(2);
    for (const s of shares) expect(s.share).toBeCloseTo(1 / 2);
  });
});

describe("权重与移除", () => {
  it("改权重全局重算：2:1 → 2/3 与 1/3", async () => {
    const b = await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    await setBeneficiaryWeight(ownerId, b.id, 2);
    const shares = beneficiaryShares(await listBeneficiaries(subId));
    expect(shares.find((s) => s.refId === memberId)!.share).toBeCloseTo(2 / 3);
    expect(shares.find((s) => s.refId === ownerId)!.share).toBeCloseTo(1 / 3);
  });

  it("移除到只剩所有者时回到无分摊状态", async () => {
    const b = await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    await removeBeneficiary(ownerId, b.id);
    const list = await listBeneficiaries(subId);
    expect(list).toHaveLength(0); // 所有者占位行一并清除
  });
});

describe("访问控制", () => {
  it("受益用户可读取订阅（只读视图），无关第三方不可", async () => {
    await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    expect(await getSubscription(memberId, subId)).not.toBeNull();
    expect(await getSubscription(strangerId, subId)).toBeNull();
  });

  it("受益用户的订阅列表包含共享订阅", async () => {
    await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    const mine = await listSubscriptions(memberId);
    expect(mine.some((s) => s.id === subId)).toBe(true);
    expect((await listSubscriptions(strangerId)).some((s) => s.id === subId)).toBe(false);
  });
});

describe("纯设备分摊（iCloud 场景）", () => {
  it("可移除所有者占位行：份额只在剩余受益人间分配，所有者份额为 0", async () => {
    const mac = await prisma.purchase.create({
      data: { ownerId, name: "MacBook", amount: 5000, currency: "CNY", amountBase: 5000, purchaseDate: d("2026-01-01") },
    });
    // 先加 USER（自动补所有者），再加 ITEM，然后移除所有者行
    await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    await addBeneficiary(ownerId, subId, { kind: "ITEM", purchaseId: mac.id });
    const list = await listBeneficiaries(subId);
    const ownerRow = list.find((b) => b.userId === ownerId)!;
    await removeBeneficiary(ownerId, ownerRow.id);
    const rest = await listBeneficiaries(subId);
    expect(rest).toHaveLength(2);
    const shares = beneficiaryShares(rest);
    expect(shares.find((s) => s.refId === memberId)!.share).toBeCloseTo(0.5);
    expect(shares.find((s) => s.refId === mac.id)!.share).toBeCloseTo(0.5);
    expect(shareFor(rest, ownerId, ownerId)).toBe(0);
  });
});

describe("物品受益规则", () => {
  it("首个 ITEM 受益人不再自动补所有者行", async () => {
    const mac = await prisma.purchase.create({
      data: { ownerId, name: "MacBook", amount: 5000, currency: "CNY", amountBase: 5000, purchaseDate: d("2026-01-01") },
    });
    await addBeneficiary(ownerId, subId, { kind: "ITEM", purchaseId: mac.id });
    const list = await listBeneficiaries(subId);
    expect(list).toHaveLength(1);
    expect(list[0].purchaseId).toBe(mac.id);
  });

  it("所有者有效份额 = 自己的 USER 行 + 全部 ITEM 行", async () => {
    const mkItem = (name: string) =>
      prisma.purchase.create({
        data: { ownerId, name, amount: 5000, currency: "CNY", amountBase: 5000, purchaseDate: d("2026-01-01") },
      });
    const mac = await mkItem("MacBook");
    const iphone = await mkItem("iPhone");
    await addBeneficiary(ownerId, subId, { kind: "USER", userId: memberId });
    await addBeneficiary(ownerId, subId, { kind: "ITEM", purchaseId: mac.id });
    await addBeneficiary(ownerId, subId, { kind: "ITEM", purchaseId: iphone.id });
    const list = await listBeneficiaries(subId);
    // 行：owner(1) + member(1) + mac(1) + iphone(1) → 所有者 = (1+1+1)/4 = 3/4
    expect(shareForViewer(list, ownerId, ownerId)).toBeCloseTo(0.75);
    expect(shareForViewer(list, ownerId, memberId)).toBeCloseTo(0.25);
  });
});
