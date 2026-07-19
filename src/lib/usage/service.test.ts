// 仓储缝测试：用量与盈亏（ticket 06）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createSubscription, getSubscription } from "../subscriptions/service";
import {
  addQuotaSnapshot,
  addUsage,
  deleteUsage,
  getUsageVerdict,
  listUsage,
  setUsageConfig,
} from "./service";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

let ownerId: string;
let otherId: string;

beforeEach(async () => {
  await prisma.usageRecord.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
  otherId = (await prisma.user.create({ data: { username: "wife", passwordHash: "x" } })).id;
});

const gym = async () => {
  const sub = await createSubscription(ownerId, {
    name: "健身房月卡",
    trackingMode: "MANUAL",
    startDate: d("2026-07-01"),
  });
  await prisma.payment.create({
    data: {
      subscriptionId: sub.id,
      amount: 217,
      currency: "CNY",
      amountBase: 217,
      paidAt: d("2026-07-01"),
      periodStart: d("2026-07-01"),
      periodEnd: d("2026-08-01"),
      source: "MANUAL",
    },
  });
  return sub;
};

describe("用量配置", () => {
  it("可设置计数型（单位 + 替代单价）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "COUNT",
      usageUnit: "次",
      altUnitPrice: 30,
    });
    const fresh = await getSubscription(ownerId, sub.id);
    expect(fresh!.usageKind).toBe("COUNT");
    expect(fresh!.altUnitPrice).toBe(30);
  });
});

describe("计数型用量与盈亏", () => {
  it("健身房场景：9 次 × 30 − 217 = +53，每次实际成本 217/9", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    for (let i = 1; i <= 9; i++) {
      await addUsage(ownerId, sub.id, ownerId, { date: d(`2026-07-0${i}`), quantity: 1 });
    }
    const fresh = await getSubscription(ownerId, sub.id);
    const v = getUsageVerdict(fresh!, await listUsage(sub.id), d("2026-07-18"));
    expect(v).not.toBeNull();
    if (v!.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v!.usage).toBe(9);
    expect(v!.cost).toBe(217);
    expect(v!.value).toBe(270);
    expect(v!.verdictAmount).toBeCloseTo(53);
    expect(v!.costPerUse).toBeCloseTo(217 / 9);
  });

  it("可删除用量记录", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const rec = await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-05"), quantity: 1 });
    await deleteUsage(ownerId, rec.id);
    expect(await listUsage(sub.id)).toHaveLength(0);
  });
});

describe("额度型用量", () => {
  it("按百分比录入自动折算已用量", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "点数",
      altUnitPrice: 0.12,
      quotaTotal: 1000,
    });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), percent: 65 });
    const records = await listUsage(sub.id);
    expect(records).toHaveLength(1);
    expect(records[0].quantity).toBe(650);
    expect(records[0].kind).toBe("TOTAL");
  });

  it("按已用量直接录入", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "点数",
      altUnitPrice: 0.12,
      quotaTotal: 1000,
    });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 800 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    expect(v!.kind).toBe("QUOTA");
    if (v!.kind !== "QUOTA") throw new Error();
    expect(v!.used).toBe(800);
    expect(v!.total).toBe(1000);
    expect(v!.usageRate).toBeCloseTo(0.8);
    expect(v!.hit100At).toBeNull();
    // 未用满 20% × 净额 217 = 浪费 43.4
    expect(v!.wastedAmount).toBeCloseTo(217 * 0.2);
    expect(v!.verdictAmount).toBeCloseTo(-217 * 0.2);
  });

  it("用满 100% 记录用满日期，浪费归零", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "点数",
      quotaTotal: 1000,
    });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-10"), used: 400 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 1000 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    if (v!.kind !== "QUOTA") throw new Error();
    expect(v!.usageRate).toBe(1);
    expect(v!.hit100At).toEqual(d("2026-07-15"));
    expect(v!.wastedAmount).toBe(0);
    expect(v!.verdictAmount).toBe(0);
  });
});

describe("记录级单价", () => {
  it("不同记录不同本次单价：30×1 + 40×1 + 默认 30×1 = 100", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-01"), quantity: 1, unitPrice: 30 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-05"), quantity: 1, unitPrice: 40 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-08"), quantity: 1 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    if (v!.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v!.value).toBeCloseTo(100);
    expect(v!.verdictAmount).toBeCloseTo(100 - 217);
  });
});

describe("共享订阅：按受益人各自盈亏", () => {
  it("计数型：费用按权重分摊，用量各自独立", async () => {
    const sub = await gym(); // 217 元，2026-07-01 ~ 08-01
    const { addBeneficiary } = await import("../beneficiaries/service");
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    // owner 去了 9 次，other 去了 3 次
    for (let i = 1; i <= 9; i++) {
      await addUsage(ownerId, sub.id, ownerId, { date: d(`2026-07-0${i}`), quantity: 1 });
    }
    for (let i = 1; i <= 3; i++) {
      await addUsage(ownerId, sub.id, otherId, { date: d(`2026-07-0${i}`), quantity: 1 });
    }
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    // 权重 1:1 → 各摊 217/2
    const vOwner = getUsageVerdict(fresh, records, d("2026-07-18"), ownerId);
    const vOther = getUsageVerdict(fresh, records, d("2026-07-18"), otherId);
    if (vOwner!.kind !== "COUNT" || vOther!.kind !== "COUNT") throw new Error();
    expect(vOwner!.cost).toBeCloseTo(217 / 2);
    expect(vOwner!.usage).toBe(9);
    expect(vOwner!.verdictAmount).toBeCloseTo(270 - 217 / 2);
    expect(vOther!.cost).toBeCloseTo(217 / 2);
    expect(vOther!.usage).toBe(3);
    expect(vOther!.verdictAmount).toBeCloseTo(90 - 217 / 2);
  });

  it("额度型：快照按人独立，浪费按份额折算", async () => {
    const sub = await gym();
    const { addBeneficiary } = await import("../beneficiaries/service");
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, otherId, { date: d("2026-07-15"), used: 500 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const vOwner = getUsageVerdict(fresh, records, d("2026-07-18"), ownerId);
    const vOther = getUsageVerdict(fresh, records, d("2026-07-18"), otherId);
    if (vOwner!.kind !== "QUOTA" || vOther!.kind !== "QUOTA") throw new Error();
    expect(vOwner!.usageRate).toBe(1);
    expect(vOwner!.wastedAmount).toBe(0);
    expect(vOther!.usageRate).toBeCloseTo(0.5);
    expect(vOther!.wastedAmount).toBeCloseTo((217 / 2) * 0.5);
  });
});

describe("受益人录入权限", () => {
  it("受益用户可记录/删除自己的用量，不能删别人的", async () => {
    const sub = await gym();
    const { addBeneficiary } = await import("../beneficiaries/service");
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    // 受益人以自己的身份录入
    const mine = await addUsage(otherId, sub.id, otherId, { date: d("2026-07-05"), quantity: 1 });
    const owners = await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-05"), quantity: 1 });
    expect(await listUsage(sub.id)).toHaveLength(2);
    // 受益人删自己的：成功；删所有者的：无效
    await deleteUsage(otherId, mine.id);
    await deleteUsage(otherId, owners.id);
    const rest = await listUsage(sub.id);
    expect(rest).toHaveLength(1);
    expect(rest[0].id).toBe(owners.id);
    // 无关第三方不能录入
    await expect(
      addUsage("nobody", sub.id, "nobody", { date: d("2026-07-05"), quantity: 1 }),
    ).rejects.toThrow(/subscription_not_found/);
  });
});
