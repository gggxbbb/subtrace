// 仓储缝测试：用量与盈亏（ticket 06）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { addBeneficiary } from "../beneficiaries/service";
import { createSubscription, getSubscription } from "../subscriptions/service";
import {
  addQuotaSnapshot,
  addSavings,
  addUsage,
  deleteUsage,
  getUsageVerdict,
  listUsage,
  setUsageConfig,
} from "./service";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

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

/** 京东 Plus 年卡：99 元，2026-07-01 ~ 2027-07-01 */
const jd = async () => {
  const sub = await createSubscription(ownerId, {
    name: "京东 Plus",
    trackingMode: "MANUAL",
    startDate: d("2026-07-01"),
  });
  await prisma.payment.create({
    data: {
      subscriptionId: sub.id,
      amount: 99,
      currency: "CNY",
      amountBase: 99,
      paidAt: d("2026-07-01"),
      periodStart: d("2026-07-01"),
      periodEnd: d("2027-07-01"),
      source: "MANUAL",
    },
  });
  return sub;
};

describe("省钱型配置与录入（ADR-0011）", () => {
  it("可设置省钱型：单位/替代单价/总额度全部置空", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    const fresh = await getSubscription(ownerId, sub.id);
    expect(fresh!.usageKind).toBe("SAVINGS");
    expect(fresh!.usageUnit).toBeNull();
    expect(fresh!.altUnitPrice).toBeNull();
    expect(fresh!.quotaTotal).toBeNull();
  });

  it("增量录入落库：DELTA/MANUAL，单价与额度置空", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    const rec = await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 6 });
    expect(rec.kind).toBe("DELTA");
    expect(rec.source).toBe("MANUAL");
    expect(rec.quantity).toBe(6);
    expect(rec.unitPrice).toBeNull();
    expect(rec.quotaTotal).toBeNull();
  });

  it("非省钱型订阅拒绝录入；无权用户拒绝", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    await expect(
      addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 6 }),
    ).rejects.toThrow(/not_savings_kind/);
    const savingsSub = await jd();
    await setUsageConfig(ownerId, savingsSub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await expect(
      addSavings("nobody", savingsSub.id, "nobody", { date: d("2026-07-05"), amount: 6 }),
    ).rejects.toThrow(/subscription_not_found/);
  });

  it("增量与累计同时给出拒绝；两者都缺拒绝", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await expect(
      addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 6, cumulative: 42 }),
    ).rejects.toThrow(/savings_ambiguous/);
    await expect(
      addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05") }),
    ).rejects.toThrow(/savings_required/);
  });

  it("累计录入自动与本区间已记求差", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 30 });
    // 平台当期已省 42 → 增量 12
    const rec = await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-18"), cumulative: 42 });
    expect(rec.quantity).toBeCloseTo(12);
  });

  it("求差 ≤ 0 拒绝（等于或低于本区间已记）", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 30 });
    await expect(
      addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-18"), cumulative: 30 }),
    ).rejects.toThrow(/savings_not_increased/);
    await expect(
      addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-18"), cumulative: 20 }),
    ).rejects.toThrow(/savings_not_increased/);
  });

  it("累计基准按用户独立：受益人不与所有者互抵", async () => {
    const sub = await jd();
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 30 });
    // wife 的平台账户当期已省 10——她的基准是自己的记录（0），不与 owner 的 30 求差
    const rec = await addSavings(otherId, sub.id, otherId, { date: d("2026-07-18"), cumulative: 10 });
    expect(rec.quantity).toBe(10);
  });

  it("新服务区间累计基准重置（会员期平台计数归零场景）", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-08-01"), amount: 80 });
    // 续费新区间：2027-07-01 ~ 2028-07-01
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: 99,
        currency: "CNY",
        amountBase: 99,
        paidAt: d("2027-07-01"),
        periodStart: d("2027-07-01"),
        periodEnd: d("2028-07-01"),
        source: "MANUAL",
      },
    });
    // 新会员年平台已省重新累计到 15——不与上一区间的 80 求差
    const rec = await addSavings(ownerId, sub.id, ownerId, { date: d("2027-08-01"), cumulative: 15 });
    expect(rec.quantity).toBe(15);
  });
});

describe("省钱型盈亏", () => {
  it("盈亏 = Σ已省 − 已摊成本", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 6 });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-18"), amount: 24 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-20"));
    if (v!.kind !== "SAVINGS") throw new Error("expect SAVINGS");
    expect(v!.saved).toBe(30);
    expect(v!.cost).toBe(99);
    expect(v!.verdictAmount).toBeCloseTo(-69);
  });

  it("零记录也有判定：已省 0，盈亏 = −成本（回答还差多少回本）", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-20"));
    if (v!.kind !== "SAVINGS") throw new Error("expect SAVINGS");
    expect(v!.saved).toBe(0);
    expect(v!.verdictAmount).toBeCloseTo(-99);
  });

  it("区间外已省不计入当前区间", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-06-15"), amount: 50 });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 6 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-20"));
    if (v!.kind !== "SAVINGS") throw new Error("expect SAVINGS");
    expect(v!.saved).toBe(6);
  });

  it("受益人切片：成本按份额，已省只计本人", async () => {
    const sub = await jd();
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 60 });
    await addSavings(otherId, sub.id, otherId, { date: d("2026-07-05"), amount: 10 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const vOwner = getUsageVerdict(fresh, records, d("2026-07-20"), ownerId);
    const vOther = getUsageVerdict(fresh, records, d("2026-07-20"), otherId);
    if (vOwner!.kind !== "SAVINGS" || vOther!.kind !== "SAVINGS") throw new Error();
    expect(vOwner!.cost).toBeCloseTo(99 / 2);
    expect(vOwner!.saved).toBe(60);
    expect(vOwner!.verdictAmount).toBeCloseTo(60 - 99 / 2);
    expect(vOther!.cost).toBeCloseTo(99 / 2);
    expect(vOther!.saved).toBe(10);
    expect(vOther!.verdictAmount).toBeCloseTo(10 - 99 / 2);
  });

  it("金额未知的覆盖段标记 costUnknown", async () => {
    const sub = await createSubscription(ownerId, {
      name: "盒马 X（存量）",
      trackingMode: "MANUAL",
      startDate: d("2026-07-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: null,
        currency: null,
        amountBase: null,
        paidAt: d("2026-07-01"),
        periodStart: d("2026-07-01"),
        periodEnd: d("2027-07-01"),
        source: "MANUAL",
      },
    });
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-05"), amount: 20 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-20"));
    if (v!.kind !== "SAVINGS") throw new Error("expect SAVINGS");
    expect(v!.costUnknown).toBe(true);
    expect(v!.saved).toBe(20);
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
