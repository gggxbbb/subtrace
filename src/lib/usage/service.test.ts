// 仓储缝测试：用量与盈亏（ticket 06）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { isoDay, today } from "../dates";
import { addBeneficiary } from "../beneficiaries/service";
import { createSubscription, getSubscription, recordPayment } from "../subscriptions/service";
import {
  addPack,
  addQuotaSnapshot,
  addSavings,
  addUsage,
  deletePack,
  deleteUsage,
  getUsageVerdict,
  getUsageVerdictForPeriod,
  listPacks,
  listUsage,
  nextAutoGrant,
  quickAddUsage,
  reconcileAutoPacks,
  setUsageConfig,
  updatePack,
  updateUsage,
  usagePeriodsOf,
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
    expect(records[0].semantic).toBe("USED");
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

describe("用量重置周期（ADR-0013）", () => {
  it("QUOTA 显式月周期 + 年付：浪费按月度窗口折算，前 11 个月快照不并入当前窗口", async () => {
    const sub = await jd(); // 99 元年付 [2026-07-01, 2027-07-01]
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "点数",
      quotaTotal: 1000,
      usageCycleUnit: "MONTH",
      usageCycleCount: 1,
      usageCycleAnchor: d("2026-01-01"),
    });
    // 年初已录满（年付段内、当前月窗口外）——月窗口下不并入本次判定
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-03-15"), used: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 800 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    if (v!.kind !== "QUOTA") throw new Error("expect QUOTA");
    // 窗口 = 当前月度窗口，而非年付成本段
    expect(v!.periodStart).toEqual(d("2026-07-01"));
    expect(v!.periodEnd).toEqual(d("2026-08-01"));
    // 用当前窗口内最新快照（800/1000），3 月的 1000 不并入
    expect(v!.used).toBe(800);
    expect(v!.usageRate).toBeCloseTo(0.8);
    // 成本 = 年付段按日费率分摊到月窗口；浪费 = 月成本 × (1 − 使用率)
    const segDays = (d("2027-07-01").getTime() - d("2026-07-01").getTime()) / 86400000;
    const overlapDays = (d("2026-08-01").getTime() - d("2026-07-01").getTime()) / 86400000;
    const monthNet = 99 * (overlapDays / segDays);
    expect(v!.cost).toBeCloseTo(monthNet);
    expect(v!.wastedAmount).toBeCloseTo(monthNet * 0.2);
    expect(v!.verdictAmount).toBeCloseTo(-monthNet * 0.2);
  });

  it("QUOTA 无显式周期：回退计费周期（与改造前一致）", async () => {
    const sub = await createSubscription(ownerId, {
      name: "月付云盘",
      trackingMode: "CYCLE",
      cycleKind: "CALENDAR",
      cycleUnit: "MONTH",
      cycleCount: 1,
      listPrice: 25,
      listCurrency: "CNY",
      listPriceBase: 25,
      startDate: d("2026-07-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: 25,
        currency: "CNY",
        amountBase: 25,
        paidAt: d("2026-07-01"),
        periodStart: d("2026-07-01"),
        periodEnd: d("2026-08-01"),
        source: "MANUAL",
      },
    });
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 800 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    if (v!.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v!.periodStart).toEqual(d("2026-07-01"));
    expect(v!.periodEnd).toEqual(d("2026-08-01"));
    expect(v!.cost).toBeCloseTo(25);
    expect(v!.usageRate).toBeCloseTo(0.8);
    expect(v!.wastedAmount).toBeCloseTo(25 * 0.2);
  });

  it("COUNT 显式周期：成本按周期窗口日费率分摊", async () => {
    const sub = await jd(); // 99 元年付 [2026-07-01, 2027-07-01]
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "COUNT",
      usageUnit: "次",
      altUnitPrice: 30,
      usageCycleUnit: "MONTH",
      usageCycleCount: 1,
      usageCycleAnchor: d("2026-01-01"),
    });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-10"), quantity: 1 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-20"), quantity: 2 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-25"));
    if (v!.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v!.periodStart).toEqual(d("2026-07-01"));
    expect(v!.periodEnd).toEqual(d("2026-08-01"));
    const segDays = (d("2027-07-01").getTime() - d("2026-07-01").getTime()) / 86400000;
    const overlapDays = (d("2026-08-01").getTime() - d("2026-07-01").getTime()) / 86400000;
    const monthNet = 99 * (overlapDays / segDays);
    expect(v!.cost).toBeCloseTo(monthNet);
    expect(v!.usage).toBe(3);
    expect(v!.value).toBe(90);
    expect(v!.verdictAmount).toBeCloseTo(90 - monthNet);
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

  it("额度型：快照池级口径（单一池，ADR-0013 D4），forUserId 只切成本份额", async () => {
    const sub = await gym();
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-18"), used: 500 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const vOwner = getUsageVerdict(fresh, records, d("2026-07-18"), ownerId);
    const vOther = getUsageVerdict(fresh, records, d("2026-07-18"), otherId);
    if (vOwner!.kind !== "QUOTA" || vOther!.kind !== "QUOTA") throw new Error();
    // 池级：受益人看到与所有者同一使用率/浪费（共享池不按人各记一遍）
    expect(vOther!.usageRate).toBeCloseTo(vOwner!.usageRate);
    expect(vOther!.usageRate).toBeCloseTo(0.5);
    expect(vOther!.used).toBe(500);
    // 成本按份额切：各摊 217/2
    expect(vOwner!.cost).toBeCloseTo(217 / 2);
    expect(vOther!.cost).toBeCloseTo(217 / 2);
    expect(vOwner!.wastedAmount).toBeCloseTo((217 / 2) * 0.5);
    expect(vOther!.wastedAmount).toBeCloseTo((217 / 2) * 0.5);
  });

  it("池快照仅所有者可录：受益人被拒；流式形态仍按人记录", async () => {
    const sub = await gym();
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await expect(
      addQuotaSnapshot(otherId, sub.id, otherId, { date: d("2026-07-15"), used: 500 }),
    ).rejects.toThrow(/quota_owner_only/);
    // 流式形态（COUNT）：受益人仍可记录自己的用量
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    await addUsage(otherId, sub.id, otherId, { date: d("2026-07-15"), quantity: 1 });
    expect(await listUsage(sub.id)).toHaveLength(1);
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
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-06-01"), amount: 80 });
    // 续费新区间：2026-07-01 ~ 2027-07-01
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
    // 新会员年平台已省重新累计到 15——不与上一区间的 80 求差
    const rec = await addSavings(ownerId, sub.id, ownerId, { date: d("2026-08-01"), cumulative: 15 });
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

// ===== 包叠加（STACKED，ADR-0012）=====

/** 像素蛋糕：手动模式，100 元 / 2026-07-01 ~ 2027-07-01，QUOTA + STACKED */
const cake = async (opts?: { amount?: number | null; periodEnd?: string }) => {
  const sub = await createSubscription(ownerId, {
    name: "像素蛋糕",
    trackingMode: "MANUAL",
    startDate: d("2026-07-01"),
  });
  const amount = opts && "amount" in opts ? opts.amount! : 100;
  await prisma.payment.create({
    data: {
      subscriptionId: sub.id,
      amount,
      currency: amount === null ? null : "CNY",
      amountBase: amount,
      paidAt: d("2026-07-01"),
      periodStart: d("2026-07-01"),
      periodEnd: d(opts?.periodEnd ?? "2027-07-01"),
      source: "MANUAL",
    },
  });
  await setUsageConfig(ownerId, sub.id, {
    usageKind: "QUOTA",
    usageUnit: "张",
    grantMode: "STACKED",
  });
  return sub;
};

describe("包叠加配置", () => {
  it("QUOTA 可设 STACKED（grantMode + packValidMonths 落库），切回 RESET 清空", async () => {
    const sub = await createSubscription(ownerId, {
      name: "像素蛋糕月付",
      trackingMode: "CYCLE",
      cycleKind: "CALENDAR",
      cycleUnit: "MONTH",
      cycleCount: 1,
      listPrice: 100,
      listCurrency: "CNY",
      listPriceBase: 100,
      startDate: d("2026-07-01"),
    });
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "张",
      grantMode: "STACKED",
      quotaTotal: 30,
      packValidMonths: 12,
    });
    let fresh = (await getSubscription(ownerId, sub.id))!;
    expect(fresh.grantMode).toBe("STACKED");
    expect(fresh.quotaTotal).toBe(30);
    expect(fresh.packValidMonths).toBe(12);
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "张",
      grantMode: "RESET",
      quotaTotal: 30,
    });
    fresh = (await getSubscription(ownerId, sub.id))!;
    expect(fresh.grantMode).toBeNull();
    expect(fresh.packValidMonths).toBeNull();
  });

  it("非 QUOTA 类型清空 grantMode/packValidMonths", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "COUNT",
      usageUnit: "次",
      altUnitPrice: 30,
      grantMode: "STACKED",
      packValidMonths: 12,
    });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    expect(fresh.grantMode).toBeNull();
    expect(fresh.packValidMonths).toBeNull();
  });

  it("手动模式 + STACKED：清空 quotaTotal/packValidMonths（无周期可推导，包手动录入）", async () => {
    const sub = await cake();
    const fresh = (await getSubscription(ownerId, sub.id))!;
    expect(fresh.grantMode).toBe("STACKED");
    expect(fresh.quotaTotal).toBeNull();
    expect(fresh.packValidMonths).toBeNull();
  });
});

describe("手动包 CRUD", () => {
  it("所有者可增/改/删手动包", async () => {
    const sub = await cake();
    const pack = await addPack(ownerId, sub.id, {
      grantedAt: d("2026-07-01"),
      quantity: 30,
      expiresAt: d("2027-07-01"),
    });
    expect(pack.source).toBe("MANUAL");
    expect(await listPacks(sub.id)).toHaveLength(1);
    await updatePack(ownerId, pack.id, { quantity: 45 });
    expect((await listPacks(sub.id))[0].quantity).toBe(45);
    await deletePack(ownerId, pack.id);
    expect(await listPacks(sub.id)).toHaveLength(0);
  });

  it("非所有者增删改均无效", async () => {
    const sub = await cake();
    await expect(
      addPack(otherId, sub.id, { grantedAt: d("2026-07-01"), quantity: 30, expiresAt: d("2027-07-01") }),
    ).rejects.toThrow(/subscription_not_found/);
    const pack = await addPack(ownerId, sub.id, {
      grantedAt: d("2026-07-01"),
      quantity: 30,
      expiresAt: d("2027-07-01"),
    });
    await updatePack(otherId, pack.id, { quantity: 99 });
    await deletePack(otherId, pack.id);
    const packs = await listPacks(sub.id);
    expect(packs).toHaveLength(1);
    expect(packs[0].quantity).toBe(30);
  });

  it("AUTO 包不可手改/手删", async () => {
    const sub = await cake();
    const auto = await prisma.quotaPack.create({
      data: {
        subscriptionId: sub.id,
        grantedAt: d("2026-07-01"),
        quantity: 30,
        expiresAt: d("2027-07-01"),
        source: "AUTO",
      },
    });
    await updatePack(ownerId, auto.id, { quantity: 99 });
    await deletePack(ownerId, auto.id);
    const packs = await listPacks(sub.id);
    expect(packs).toHaveLength(1);
    expect(packs[0].quantity).toBe(30);
  });

  it("非 STACKED 订阅拒绝加包", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await expect(
      addPack(ownerId, sub.id, { grantedAt: d("2026-07-01"), quantity: 30, expiresAt: d("2027-07-01") }),
    ).rejects.toThrow(/not_stacked/);
  });
});

describe("STACKED 快照录入", () => {
  it("remaining 落库 kind=TOTAL（quantity=剩余），quotaTotal/unitPrice 置空", async () => {
    const sub = await cake();
    const rec = await addQuotaSnapshot(ownerId, sub.id, ownerId, {
      date: d("2026-07-15"),
      remaining: 45,
    });
    expect(rec.kind).toBe("TOTAL");
    expect(rec.quantity).toBe(45);
    expect(rec.quotaTotal).toBeNull();
    expect(rec.unitPrice).toBeNull();
  });

  it("STACKED 收 used 落库 semantic=USED + quotaTotal；混传二选一拒绝；缺全部拒绝", async () => {
    const sub = await cake();
    // STACKED 接受 used：语义随记录自描述（ADR-0013 D3），需 quotaTotal 才能折算剩余
    const used = await addQuotaSnapshot(ownerId, sub.id, ownerId, {
      date: d("2026-07-15"),
      used: 10,
      quotaTotal: 60,
    });
    expect(used.semantic).toBe("USED");
    expect(used.quantity).toBe(10);
    expect(used.quotaTotal).toBe(60);
    expect(used.kind).toBe("TOTAL");
    // remaining 与 used 混传：二选一
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), remaining: 50, used: 10 }),
    ).rejects.toThrow(/quota_snapshot_ambiguous/);
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), remaining: 50, percent: 20 }),
    ).rejects.toThrow(/quota_snapshot_ambiguous/);
    // 全部缺：usage_required
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15") }),
    ).rejects.toThrow(/usage_required/);
  });

  it("RESET 收 remaining 落库 semantic=REMAINING（quotaTotal 置空）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    const rec = await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), remaining: 800 });
    expect(rec.semantic).toBe("REMAINING");
    expect(rec.quantity).toBe(800);
    expect(rec.quotaTotal).toBeNull();
    expect(rec.kind).toBe("TOTAL");
  });

  it("STACKED 订阅拒绝 DELTA 增量录入", async () => {
    const sub = await cake();
    await expect(
      addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-15"), quantity: 1 }),
    ).rejects.toThrow(/stacked_no_delta/);
  });
});

describe("形态切换语义（ADR-0013 记录自描述）", () => {
  /** 手动模式 100 元 / 2026-07-01 ~ 2027-07-01 的 QUOTA 订阅 */
  const makeSub = async () => {
    const sub = await createSubscription(ownerId, {
      name: "形态切换",
      trackingMode: "MANUAL",
      startDate: d("2026-07-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: 100,
        currency: "CNY",
        amountBase: 100,
        paidAt: d("2026-07-01"),
        periodStart: d("2026-07-01"),
        periodEnd: d("2027-07-01"),
        source: "MANUAL",
      },
    });
    return sub;
  };

  it("RESET 录 USED → 切 STACKED → packVerdict 按 USED 折算 remaining = total − used（不重解读）", async () => {
    const sub = await makeSub();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "张", quotaTotal: 60 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 10, quotaTotal: 60 });
    // 切 STACKED（手动模式清空 quotaTotal）：快照语义不随形态重解读
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "张", grantMode: "STACKED" });
    await addPack(ownerId, sub.id, { grantedAt: d("2026-07-01"), quantity: 60, expiresAt: d("2027-07-01") });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-20"));
    if (v?.kind !== "PACK") throw new Error("expect PACK");
    // USED(quantity=10, total=60) → remaining = 60 − 10 = 50；若误当剩余直读会得 10
    expect(v.balance).toBe(50);
    expect(v.balanceAt).toEqual(d("2026-07-15"));
  });

  it("STACKED 录 REMAINING → 切 RESET → 按 REMAINING 折算 used = total − remaining", async () => {
    const sub = await makeSub();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", grantMode: "STACKED" });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), remaining: 200 });
    // 切回 RESET：REMAINING 折算 used = total − remaining；若误当已用直读会得 200
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.used).toBe(800);
    expect(v.total).toBe(1000);
    expect(v.usageRate).toBeCloseTo(0.8);
  });
});

describe("PackVerdict 装配", () => {
  /** A 包 7/1 发 30 张 8/1 到期；B 包 7/15 发 30 张 次年 1/15 到期；快照 7/20 余 60 → 8/5 余 25 */
  const ledger = async () => {
    const sub = await cake();
    await addPack(ownerId, sub.id, { grantedAt: d("2026-07-01"), quantity: 30, expiresAt: d("2026-08-01") });
    await addPack(ownerId, sub.id, { grantedAt: d("2026-07-15"), quantity: 30, expiresAt: d("2027-01-15") });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-20"), remaining: 60 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-08-05"), remaining: 25 });
    return sub;
  };

  it("浪费导向：verdictAmount = −本区间确认浪费；余额/快照日期/陈旧天数/到期预警/累计浪费", async () => {
    const sub = await ledger();
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-08-10"));
    if (v?.kind !== "PACK") throw new Error("expect PACK");
    // A 包到期焚毁 30 张；单张成本 = 段净额 100 ÷ 段内发放 60 → 浪费 50
    expect(v.periodWaste.quantity).toBe(30);
    expect(v.periodWaste.amount).toBeCloseTo(50);
    expect(v.totalWaste.amount).toBeCloseTo(50);
    expect(v.verdictAmount).toBeCloseTo(-50);
    expect(v.cost).toBeCloseTo(100);
    expect(v.balance).toBe(25);
    expect(v.balanceAt).toEqual(d("2026-08-05"));
    expect(v.staleDays).toBe(5);
    expect(v.consumptionInferred).toBe(5);
    expect(v.nextExpiry).not.toBeNull();
    expect(v.nextExpiry!.date).toEqual(d("2027-01-15"));
    expect(v.nextExpiry!.quantity).toBe(30);
    expect(v.nextExpiry!.projectedBalance).toBe(25);
    // 浪费明细：带确认日的事件列表（story 23 回看入口的数据源）
    expect(v.wasteEvents).toHaveLength(1);
    expect(v.wasteEvents[0].date).toEqual(d("2026-08-01"));
    expect(v.wasteEvents[0].quantity).toBe(30);
    expect(v.wasteEvents[0].amount).toBeCloseTo(50);
  });

  it("浪费明细跨区间可回看（story 23）：续费后新区间 periodWaste 归零，wasteEvents 仍在", async () => {
    const sub = await ledger();
    // 续费：在 2027-07-01 到期前加一笔 2027-07-01 ~ 2028-07-01 的付费记录
    await recordPayment(ownerId, sub.id, {
      amount: 100,
      currency: "CNY",
      amountBase: 100,
      paidAt: d("2027-06-15"),
      periodStart: d("2027-07-01"),
      periodEnd: d("2028-07-01"),
      source: "MANUAL",
    });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const v = getUsageVerdict(fresh, records, d("2027-08-10"));
    if (v?.kind !== "PACK") throw new Error("expect PACK");
    // 新区间（2027-07-01 起）无确认浪费；B 包已于 2027-01-15 到期焚毁，事件仍可回看
    expect(v.periodWaste.amount).toBe(0);
    expect(v.wasteEvents.length).toBeGreaterThanOrEqual(1);
    expect(v.wasteEvents.some((w) => w.date.getTime() === d("2026-08-01").getTime())).toBe(true);
  });

  it("池级口径：forUserId 只切成本份额，余额/浪费/verdictAmount 不按人切", async () => {
    const sub = await ledger();
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const vOwner = getUsageVerdict(fresh, records, d("2026-08-10"), ownerId);
    const vOther = getUsageVerdict(fresh, records, d("2026-08-10"), otherId);
    if (vOwner?.kind !== "PACK" || vOther?.kind !== "PACK") throw new Error("expect PACK");
    expect(vOwner.cost).toBeCloseTo(50);
    expect(vOther.cost).toBeCloseTo(50);
    expect(vOther.balance).toBe(25);
    expect(vOther.verdictAmount).toBeCloseTo(vOwner.verdictAmount);
    expect(vOther.periodWaste.amount).toBeCloseTo(vOwner.periodWaste.amount);
  });

  it("覆盖段金额未知：costUnknown 透传", async () => {
    const sub = await cake({ amount: null });
    await addPack(ownerId, sub.id, { grantedAt: d("2026-07-01"), quantity: 30, expiresAt: d("2026-08-01") });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-20"), remaining: 30 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-08-05"), remaining: 10 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-08-10"));
    if (v?.kind !== "PACK") throw new Error("expect PACK");
    expect(v.costUnknown).toBe(true);
    expect(v.periodWaste.quantity).toBe(30);
    expect(v.periodWaste.amount).toBe(0);
  });

  it("停订即焚：订阅已到期时合成 remaining=0 快照，终止日全量浪费显形", async () => {
    const sub = await cake({ amount: 60, periodEnd: "2026-08-01" });
    await addPack(ownerId, sub.id, { grantedAt: d("2026-07-01"), quantity: 30, expiresAt: d("2027-07-01") });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-10"), remaining: 28 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    // 到期前：包存活，只有到期预警，无确认浪费
    const before = getUsageVerdict(fresh, records, d("2026-07-20"));
    if (before?.kind !== "PACK") throw new Error("expect PACK");
    expect(before.periodWaste.quantity).toBe(0);
    expect(before.nextExpiry!.projectedBalance).toBe(28);
    // 到期后（today 2026-08-10）：合成 8/1 remaining=0 → 28 张全焚，单张 60/30=2 → 浪费 56
    const after = getUsageVerdict(fresh, records, d("2026-08-10"));
    if (after?.kind !== "PACK") throw new Error("expect PACK");
    expect(after.balance).toBe(0);
    expect(after.balanceAt).toEqual(d("2026-08-01"));
    expect(after.periodWaste.quantity).toBe(28);
    expect(after.periodWaste.amount).toBeCloseTo(56);
    expect(after.verdictAmount).toBeCloseTo(-56);
  });

  it("无快照也有判定：余额 0 / balanceAt null / 浪费 0（录入入口提示用）", async () => {
    const sub = await cake();
    await addPack(ownerId, sub.id, { grantedAt: d("2026-07-01"), quantity: 30, expiresAt: d("2027-07-01") });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-20"));
    if (v?.kind !== "PACK") throw new Error("expect PACK");
    expect(v.balance).toBe(0);
    expect(v.balanceAt).toBeNull();
    expect(v.staleDays).toBeNull();
    expect(v.periodWaste.amount).toBe(0);
    expect(v.verdictAmount).toBe(0);
  });
});

// ===== AUTO 包生成器（ADR-0012 读时对齐，ticket 03）=====

/** 像素蛋糕周期版：月付 25 元，QUOTA + STACKED，每月 30 张，有效期可配 */
const cakeCycle = async (opts?: { startDate?: string; validMonths?: number; fixedDays?: number }) => {
  const sub = await createSubscription(ownerId, {
    name: "像素蛋糕周期",
    trackingMode: "CYCLE",
    ...(opts?.fixedDays
      ? { cycleKind: "FIXED_DAYS" as const, fixedDays: opts.fixedDays }
      : { cycleKind: "CALENDAR" as const, cycleUnit: "MONTH" as const, cycleCount: 1 }),
    listPrice: 25,
    listCurrency: "CNY",
    listPriceBase: 25,
    startDate: d(opts?.startDate ?? "2026-03-01"),
  });
  await setUsageConfig(ownerId, sub.id, {
    usageKind: "QUOTA",
    usageUnit: "张",
    grantMode: "STACKED",
    quotaTotal: 30,
    packValidMonths: opts?.validMonths ?? 12,
  });
  return sub;
};

const autoGrants = async (subscriptionId: string) =>
  (await listPacks(subscriptionId))
    .filter((p) => p.source === "AUTO")
    .map((p) => [p.grantedAt, p.quantity, p.expiresAt] as const);

describe("AUTO 包生成器（读时对齐）", () => {
  it("按月补齐到 today：未来包不物化，expiresAt = 下发 + 有效期日历月", async () => {
    const sub = await cakeCycle({ startDate: "2026-03-01" });
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    expect(await autoGrants(sub.id)).toEqual([
      [d("2026-03-01"), 30, d("2027-03-01")],
      [d("2026-04-01"), 30, d("2027-04-01")],
      [d("2026-05-01"), 30, d("2027-05-01")],
      [d("2026-06-01"), 30, d("2027-06-01")],
      [d("2026-07-01"), 30, d("2027-07-01")],
      [d("2026-08-01"), 30, d("2027-08-01")],
    ]);
  });

  it("幂等：重复触发不产生重复包（行 id 不变）", async () => {
    const sub = await cakeCycle({ startDate: "2026-03-01" });
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    const first = await listPacks(sub.id);
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    const second = await listPacks(sub.id);
    expect(second.map((p) => p.id)).toEqual(first.map((p) => p.id));
    // 时间推进后只补新到期的周期
    await reconcileAutoPacks(sub.id, d("2026-09-15"));
    expect((await autoGrants(sub.id)).map(([g]) => g)).toContainEqual(d("2026-09-01"));
    expect(await listPacks(sub.id)).toHaveLength(7);
  });

  it("锚点改写（录带服务止期的付费记录）后未来包重排，已过去的包不动", async () => {
    const sub = await cakeCycle({ startDate: "2026-03-01", validMonths: 1 });
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    // 有效期 1 个月：3/1~7/1 包已到期（到期日 ≤ today），8/1 包存活（9/1 到期）
    await recordPayment(ownerId, sub.id, {
      amount: 300,
      currency: "CNY",
      amountBase: 300,
      paidAt: d("2026-08-03"),
      periodStart: d("2026-06-10"),
      periodEnd: d("2027-06-10"),
      source: "MANUAL",
    });
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    const grants = (await autoGrants(sub.id)).map(([g]) => g);
    // 新计划：首笔前 3/1~6/1（截断到 6/10）+ 付费区间内 6/10、7/10（8/10 未来不物化）
    // 7/1 包已到期——即使与新计划对不上也不动；8/1 包存活但对不上——删除
    expect(grants).toEqual([
      d("2026-03-01"),
      d("2026-04-01"),
      d("2026-05-01"),
      d("2026-06-01"),
      d("2026-06-10"),
      d("2026-07-01"),
      d("2026-07-10"),
    ]);
    // 再触发幂等
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    expect((await autoGrants(sub.id)).map(([g]) => g)).toEqual(grants);
  });

  it("MANUAL 行不受对账影响（即使与计划对不上）", async () => {
    const sub = await cakeCycle({ startDate: "2026-08-01" });
    const manual = await addPack(ownerId, sub.id, {
      grantedAt: d("2026-08-02"),
      quantity: 5,
      expiresAt: d("2026-09-02"),
    });
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    const packs = await listPacks(sub.id);
    const kept = packs.find((p) => p.id === manual.id);
    expect(kept).toBeTruthy();
    expect(kept!.quantity).toBe(5);
    expect(packs.filter((p) => p.source === "AUTO").map((p) => p.grantedAt)).toEqual([d("2026-08-01")]);
  });

  it("手动模式订阅跳过生成", async () => {
    const sub = await cake();
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    expect(await listPacks(sub.id)).toHaveLength(0);
  });

  it("缺配置（quotaTotal / packValidMonths 为空）不生成", async () => {
    const sub = await createSubscription(ownerId, {
      name: "缺配置",
      trackingMode: "CYCLE",
      cycleKind: "CALENDAR",
      cycleUnit: "MONTH",
      cycleCount: 1,
      listPrice: 25,
      listCurrency: "CNY",
      listPriceBase: 25,
      startDate: d("2026-03-01"),
    });
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "张", grantMode: "STACKED" });
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    expect(await listPacks(sub.id)).toHaveLength(0);
  });

  it("固定天数周期：每 30 天一个包", async () => {
    const sub = await cakeCycle({ startDate: "2026-07-04", fixedDays: 30 });
    await reconcileAutoPacks(sub.id, d("2026-08-03"));
    expect((await autoGrants(sub.id)).map(([g]) => g)).toEqual([d("2026-07-04"), d("2026-08-03")]);
  });

  it("日历周期月付锚定原始日：1/31 起 → 2/28、3/31、4/30；各包 expiresAt 按自身下发日推", async () => {
    const sub = await cakeCycle({ startDate: "2026-01-31", validMonths: 1 });
    await reconcileAutoPacks(sub.id, d("2026-05-01"));
    expect(await autoGrants(sub.id)).toEqual([
      [d("2026-01-31"), 30, d("2026-02-28")],
      [d("2026-02-28"), 30, d("2026-03-28")],
      [d("2026-03-31"), 30, d("2026-04-30")],
      [d("2026-04-30"), 30, d("2026-05-30")],
    ]);
  });

  it("下期将下发：临时推导第一个 > today 的计划发放日，随锚点改写变化", async () => {
    const sub = await cakeCycle({ startDate: "2026-03-01" });
    let fresh = (await getSubscription(ownerId, sub.id))!;
    expect(nextAutoGrant(fresh, d("2026-08-03"))).toEqual({ date: d("2026-09-01"), quantity: 30 });
    await recordPayment(ownerId, sub.id, {
      amount: 300,
      currency: "CNY",
      amountBase: 300,
      paidAt: d("2026-08-03"),
      periodStart: d("2026-07-20"),
      periodEnd: d("2027-07-20"),
      source: "MANUAL",
    });
    fresh = (await getSubscription(ownerId, sub.id))!;
    expect(nextAutoGrant(fresh, d("2026-08-03"))).toEqual({ date: d("2026-08-20"), quantity: 30 });
    // 手动模式 / 非 STACKED 无下期
    const manual = await cake();
    expect(nextAutoGrant((await getSubscription(ownerId, manual.id))!, d("2026-08-03"))).toBeNull();
  });
});

// ===== 历史回看（ticket 04）：周期序列 + 显式周期 verdict =====

/** 年卡历史：99 元 / 2025-07-01 ~ 2026-07-01（过去一整年，供历史窗口回看） */
const yearlyPast = async () => {
  const sub = await createSubscription(ownerId, {
    name: "年卡历史",
    trackingMode: "MANUAL",
    startDate: d("2025-07-01"),
  });
  await prisma.payment.create({
    data: {
      subscriptionId: sub.id,
      amount: 99,
      currency: "CNY",
      amountBase: 99,
      paidAt: d("2025-07-01"),
      periodStart: d("2025-07-01"),
      periodEnd: d("2026-07-01"),
      source: "MANUAL",
    },
  });
  return sub;
};

describe("周期序列（usagePeriodsOf）", () => {
  it("显式 usageCycle：月度窗口序列，截至覆盖 today 的当前窗口", async () => {
    const sub = await jd(); // 99 元年付 [2026-07-01, 2027-07-01]
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "COUNT",
      usageUnit: "次",
      altUnitPrice: 30,
      usageCycleUnit: "MONTH",
      usageCycleCount: 1,
      usageCycleAnchor: d("2026-01-01"),
    });
    const periods = usagePeriodsOf((await getSubscription(ownerId, sub.id))!, d("2026-07-18"));
    expect(periods).toHaveLength(7);
    expect(periods[0]).toEqual({ start: d("2026-01-01"), end: d("2026-02-01") });
    expect(periods[6]).toEqual({ start: d("2026-07-01"), end: d("2026-08-01") });
  });

  it("QUOTA 无显式周期：回退计费周期（CYCLE 月付）", async () => {
    const sub = await createSubscription(ownerId, {
      name: "月付云盘",
      trackingMode: "CYCLE",
      cycleKind: "CALENDAR",
      cycleUnit: "MONTH",
      cycleCount: 1,
      listPrice: 25,
      listCurrency: "CNY",
      listPriceBase: 25,
      startDate: d("2026-07-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: 25,
        currency: "CNY",
        amountBase: 25,
        paidAt: d("2026-07-01"),
        periodStart: d("2026-07-01"),
        periodEnd: d("2026-08-01"),
        source: "MANUAL",
      },
    });
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    const periods = usagePeriodsOf((await getSubscription(ownerId, sub.id))!, d("2026-09-10"));
    expect(periods).toHaveLength(3);
    expect(periods[0]).toEqual({ start: d("2026-07-01"), end: d("2026-08-01") });
    expect(periods[2]).toEqual({ start: d("2026-09-01"), end: d("2026-10-01") });
  });

  it("COUNT 无显式周期：成本段序列", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const periods = usagePeriodsOf((await getSubscription(ownerId, sub.id))!, d("2026-07-18"));
    expect(periods).toEqual([{ start: d("2026-07-01"), end: d("2027-07-01") }]);
  });
});

describe("显式周期盈亏（getUsageVerdictForPeriod）", () => {
  it("RESET 历史月度窗口：periodStart/End = 该窗口，成本按月分摊，浪费按窗口快照", async () => {
    const sub = await yearlyPast();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "点数",
      quotaTotal: 1000,
      usageCycleUnit: "MONTH",
      usageCycleCount: 1,
      usageCycleAnchor: d("2025-07-01"),
    });
    // 5 月窗口内 500/1000；6 月窗口（当前）800——不得并入 5 月判定
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-05-15"), used: 500 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-06-10"), used: 800 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const v = getUsageVerdictForPeriod(fresh, records, { start: d("2026-05-01"), end: d("2026-06-01") }, d("2026-08-21"));
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.periodStart).toEqual(d("2026-05-01"));
    expect(v.periodEnd).toEqual(d("2026-06-01"));
    const mayNet = 99 * (31 / 365); // 5 月 31 天 × 年付日费率
    expect(v.cost).toBeCloseTo(mayNet);
    expect(v.used).toBe(500);
    expect(v.usageRate).toBeCloseTo(0.5);
    expect(v.wastedAmount).toBeCloseTo(mayNet * 0.5);
    expect(v.verdictAmount).toBeCloseTo(-mayNet * 0.5);
  });

  it("COUNT 历史月度窗口：usage/value/cost 取自该窗口", async () => {
    const sub = await yearlyPast();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "COUNT",
      usageUnit: "次",
      altUnitPrice: 30,
      usageCycleUnit: "MONTH",
      usageCycleCount: 1,
      usageCycleAnchor: d("2025-07-01"),
    });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-05-10"), quantity: 2 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-05-20"), quantity: 1 });
    await addUsage(ownerId, sub.id, ownerId, { date: d("2026-06-10"), quantity: 5 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const v = getUsageVerdictForPeriod(fresh, records, { start: d("2026-05-01"), end: d("2026-06-01") }, d("2026-08-21"));
    if (v?.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v.periodStart).toEqual(d("2026-05-01"));
    expect(v.periodEnd).toEqual(d("2026-06-01"));
    const mayNet = 99 * (31 / 365);
    expect(v.usage).toBe(3); // 6/10 的 5 次不在窗口
    expect(v.value).toBe(90);
    expect(v.cost).toBeCloseTo(mayNet);
    expect(v.verdictAmount).toBeCloseTo(90 - mayNet);
  });

  it("SAVINGS 历史月度窗口：saved/cost 取自该窗口", async () => {
    const sub = await yearlyPast();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "SAVINGS",
      usageUnit: "",
      usageCycleUnit: "MONTH",
      usageCycleCount: 1,
      usageCycleAnchor: d("2025-07-01"),
    });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-05-05"), amount: 6 });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-06-10"), amount: 24 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    const v = getUsageVerdictForPeriod(fresh, records, { start: d("2026-05-01"), end: d("2026-06-01") }, d("2026-08-21"));
    if (v?.kind !== "SAVINGS") throw new Error("expect SAVINGS");
    expect(v.saved).toBe(6);
    expect(v.cost).toBeCloseTo(99 * (31 / 365));
    expect(v.verdictAmount).toBeCloseTo(6 - 99 * (31 / 365));
  });

  it("STACKED 历史窗口覆盖：periodWaste 按该窗口归因（止期排他，邻窗不计）", async () => {
    const sub = await createSubscription(ownerId, {
      name: "像素蛋糕历史",
      trackingMode: "MANUAL",
      startDate: d("2026-01-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: 120,
        currency: "CNY",
        amountBase: 120,
        paidAt: d("2026-01-01"),
        periodStart: d("2026-01-01"),
        periodEnd: d("2027-01-01"),
        source: "MANUAL",
      },
    });
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "张",
      grantMode: "STACKED",
      usageCycleUnit: "MONTH",
      usageCycleCount: 1,
      usageCycleAnchor: d("2026-01-01"),
    });
    // X 包 3/1 焚毁 30 张；Y 包 4/1 到期（最新快照 3/15 之后仅预警，不确认浪费）
    await addPack(ownerId, sub.id, { grantedAt: d("2026-02-01"), quantity: 30, expiresAt: d("2026-03-01") });
    await addPack(ownerId, sub.id, { grantedAt: d("2026-03-01"), quantity: 30, expiresAt: d("2026-04-01") });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-02-15"), remaining: 30 }); // 仅 X 包，未消耗
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-03-15"), remaining: 30 }); // 仅 Y 包
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    // 历史窗口序列：1~4 月（截至覆盖 4/10 的当前窗口）
    const periods = usagePeriodsOf(fresh, d("2026-04-10"));
    expect(periods).toHaveLength(4);
    expect(periods[2]).toEqual({ start: d("2026-03-01"), end: d("2026-04-01") });
    const march = getUsageVerdictForPeriod(fresh, records, periods[2], d("2026-04-10"));
    if (march?.kind !== "PACK") throw new Error("expect PACK");
    expect(march.periodStart).toEqual(d("2026-03-01"));
    expect(march.periodEnd).toEqual(d("2026-04-01"));
    expect(march.periodWaste.quantity).toBe(30);
    expect(march.periodWaste.amount).toBeCloseTo(60); // 单张 120/60 = 2
    expect(march.verdictAmount).toBeCloseTo(-60);
    expect(march.cost).toBeCloseTo(120 * (31 / 365));
    // 止期排他：2 月窗口不含 3/1 的浪费
    const feb = getUsageVerdictForPeriod(fresh, records, periods[1], d("2026-04-10"));
    if (feb?.kind !== "PACK") throw new Error("expect PACK");
    expect(feb.periodWaste.quantity).toBe(0);
    expect(feb.periodWaste.amount).toBe(0);
  });

  it("STACKED 过期订阅：历史末窗含到期日焚毁（含端点归因）", async () => {
    const sub = await createSubscription(ownerId, {
      name: "像素蛋糕停订",
      trackingMode: "MANUAL",
      startDate: d("2026-01-01"),
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: 120,
        currency: "CNY",
        amountBase: 120,
        paidAt: d("2026-01-01"),
        periodStart: d("2026-01-01"),
        periodEnd: d("2026-03-01"),
        source: "MANUAL",
      },
    });
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "张",
      grantMode: "STACKED",
    });
    // X 包 4/1 到期（晚于订阅 3/1 到期）→ 有效到期日截断为 3/1，停订即焚于 3/1
    await addPack(ownerId, sub.id, { grantedAt: d("2026-01-01"), quantity: 30, expiresAt: d("2026-04-01") });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-01-15"), remaining: 30 });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const records = await listUsage(sub.id);
    // 手动模式 + 无显式 usageCycle → 周期序列 = 成本段序列：[1/1, 3/1)
    const periods = usagePeriodsOf(fresh, d("2026-03-15"));
    expect(periods).toHaveLength(1);
    const last = getUsageVerdictForPeriod(fresh, records, periods[0], d("2026-03-15"), undefined, true);
    if (last?.kind !== "PACK") throw new Error("expect PACK");
    expect(last.periodWaste.quantity).toBe(30); // 3/1 到期日全量焚毁，含端点归因
    expect(last.periodWaste.amount).toBeCloseTo(120); // 单张 120/30 = 4
    // 对照：不含端点归因时该窗计 0（正是 review 捕获的缺口）
    const plain = getUsageVerdictForPeriod(fresh, records, periods[0], d("2026-03-15"));
    if (plain?.kind !== "PACK") throw new Error("expect PACK");
    expect(plain.periodWaste.quantity).toBe(0);
  });
});

describe("快捷录入（ui-wave-a ticket 02 服务缝）", () => {
  it("写入字段：日期 = 北京墙钟今日、元组 quantity/unitPrice、kind=DELTA、记本人名下", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const rec = await quickAddUsage(ownerId, sub.id, { quantity: 2, unitPrice: 39 });
    expect(rec.kind).toBe("DELTA");
    expect(rec.quantity).toBe(2);
    expect(rec.unitPrice).toBe(39);
    expect(rec.userId).toBe(ownerId);
    expect(isoDay(rec.date)).toBe(isoDay(new Date()));
  });

  it("单价缺省 → 记录 unitPrice 为 null（verdict 读取时走订阅替代单价继承链）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const rec = await quickAddUsage(ownerId, sub.id, { quantity: 1 });
    expect(rec.unitPrice).toBeNull();
  });

  it("非计数型拒绝：额度型 / 未配置均抛 quick_count_only", async () => {
    const quota = await gym();
    await setUsageConfig(ownerId, quota.id, { usageKind: "QUOTA", usageUnit: "张", quotaTotal: 100 });
    await expect(quickAddUsage(ownerId, quota.id, { quantity: 1 })).rejects.toThrow("quick_count_only");
    const plain = await gym();
    await expect(quickAddUsage(ownerId, plain.id, { quantity: 1 })).rejects.toThrow("quick_count_only");
  });

  it("受益人快捷录入写自己名下（ADR-0003 按人切片）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    await addBeneficiary(ownerId, sub.id, { kind: "USER", userId: otherId });
    const rec = await quickAddUsage(otherId, sub.id, { quantity: 1 });
    expect(rec.userId).toBe(otherId);
  });

  it("负数 quantity 拒绝（沿用 addUsage 守卫）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次" });
    await expect(quickAddUsage(ownerId, sub.id, { quantity: -1 })).rejects.toThrow("usage_negative");
  });
});

describe("录入守卫（ticket 03）", () => {
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

  it("快照：已用量与百分比混传拒绝（二选一）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 800, percent: 65 }),
    ).rejects.toThrow(/quota_used_percent_ambiguous/);
  });

  it("快照：负已用量 / 负百分比拒绝", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: -1 }),
    ).rejects.toThrow(/quota_used_negative/);
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), percent: -10 }),
    ).rejects.toThrow(/quota_percent_negative/);
  });

  it("快照：percent 超 100% 接受——usageRate 封顶 1，overageRate 暴露超额", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), percent: 150 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.used).toBe(1500);
    expect(v.usageRate).toBe(1);
    expect(v.overageRate).toBeCloseTo(0.5);
    expect(v.wastedAmount).toBe(0);
    expect(v.verdictAmount).toBe(0);
    expect(v.hit100At).toEqual(d("2026-07-15"));
  });

  it("未超额时 overageRate 为 undefined", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 800 });
    const v = getUsageVerdict((await getSubscription(ownerId, sub.id))!, await listUsage(sub.id), d("2026-07-18"));
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.overageRate).toBeUndefined();
  });

  it("未来日期拒绝：快照/用量/省钱/包", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: inDays(3), used: 100 }),
    ).rejects.toThrow(/future_date/);
    await expect(
      addUsage(ownerId, sub.id, ownerId, { date: inDays(3), quantity: 1 }),
    ).rejects.toThrow(/future_date/);
    const savingsSub = await jd();
    await setUsageConfig(ownerId, savingsSub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await expect(
      addSavings(ownerId, savingsSub.id, ownerId, { date: inDays(3), amount: 6 }),
    ).rejects.toThrow(/future_date/);
    const stack = await cake();
    await expect(
      addPack(ownerId, stack.id, { grantedAt: inDays(3), quantity: 30, expiresAt: inDays(33) }),
    ).rejects.toThrow(/future_date/);
  });

  it("用量：负数量拒绝", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    await expect(
      addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-15"), quantity: -1 }),
    ).rejects.toThrow(/usage_negative/);
  });

  it("省钱：负金额拒绝", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await expect(
      addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-15"), amount: -6 }),
    ).rejects.toThrow(/savings_negative/);
  });

  it("包：发放日晚于到期日拒绝", async () => {
    const sub = await cake();
    await expect(
      addPack(ownerId, sub.id, { grantedAt: d("2026-07-10"), quantity: 30, expiresAt: d("2026-07-01") }),
    ).rejects.toThrow(/pack_invalid_range/);
  });

  it("包：发放日晚于订阅到期拒绝", async () => {
    const sub = await cake(); // 订阅 2027-07-01 到期
    await expect(
      addPack(ownerId, sub.id, { grantedAt: d("2027-08-01"), quantity: 30, expiresAt: d("2027-09-01") }),
    ).rejects.toThrow(/pack_after_expiry/);
  });

  it("updateUsage：COUNT/SAVINGS 记录不可改总额度，QUOTA 记录不可改单价", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const rec = await addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-05"), quantity: 1 });
    await expect(updateUsage(ownerId, rec.id, { quotaTotal: 500 })).rejects.toThrow(
      /quota_total_not_allowed/,
    );
    // 计数记录改数量仍可
    await updateUsage(ownerId, rec.id, { quantity: 2 });
    const qSub = await gym();
    await setUsageConfig(ownerId, qSub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    const qrec = await addQuotaSnapshot(ownerId, qSub.id, ownerId, { date: d("2026-07-15"), used: 800 });
    await expect(updateUsage(ownerId, qrec.id, { unitPrice: 3 })).rejects.toThrow(/unit_price_not_allowed/);
    // 额度记录改总量仍可
    await updateUsage(ownerId, qrec.id, { quotaTotal: 1200 });
    const savingsSub = await jd();
    await setUsageConfig(ownerId, savingsSub.id, { usageKind: "SAVINGS", usageUnit: "" });
    const srec = await addSavings(ownerId, savingsSub.id, ownerId, { date: d("2026-07-05"), amount: 6 });
    await expect(updateUsage(ownerId, srec.id, { quotaTotal: 1 })).rejects.toThrow(/quota_total_not_allowed/);
  });
});

describe("带日期写路径（usage-shell ticket 01：录入台补记）", () => {
  it("计数型：过去日期补记落库，日期原样保留", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const rec = await addUsage(ownerId, sub.id, ownerId, {
      date: d("2026-07-20"),
      quantity: 2,
      unitPrice: 25,
    });
    expect(isoDay(rec.date)).toBe("2026-07-20");
    const rows = await listUsage(sub.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("DELTA");
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].unitPrice).toBe(25);
  });

  it("额度型：过去日期补记快照落库（RESET 已用 / 剩余两姿势）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, {
      usageKind: "QUOTA",
      usageUnit: "GB",
      altUnitPrice: 0.12,
      quotaTotal: 1000,
    });
    const used = await addQuotaSnapshot(ownerId, sub.id, ownerId, {
      date: d("2026-07-20"),
      used: 300,
    });
    expect(isoDay(used.date)).toBe("2026-07-20");
    expect(used.semantic).toBe("USED");
    const remaining = await addQuotaSnapshot(ownerId, sub.id, ownerId, {
      date: d("2026-07-21"),
      remaining: 650,
    });
    expect(isoDay(remaining.date)).toBe("2026-07-21");
    expect(remaining.semantic).toBe("REMAINING");
    expect(await listUsage(sub.id)).toHaveLength(2);
  });

  it("省钱型：过去日期补记落库（累计求差按补记日所在区间取基准）", async () => {
    const sub = await jd();
    await setUsageConfig(ownerId, sub.id, { usageKind: "SAVINGS", usageUnit: "" });
    await addSavings(ownerId, sub.id, ownerId, { date: d("2026-07-10"), amount: 6 });
    const rec = await addSavings(ownerId, sub.id, ownerId, {
      date: d("2026-07-12"),
      cumulative: 20,
    });
    expect(isoDay(rec.date)).toBe("2026-07-12");
    expect(rec.quantity).toBe(14); // 20 − 本区间已记 6
  });

  it("北京墙钟今日允许（边界非未来）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "COUNT", usageUnit: "次", altUnitPrice: 30 });
    const rec = await addUsage(ownerId, sub.id, ownerId, { date: today(), quantity: 1 });
    expect(isoDay(rec.date)).toBe(isoDay(today()));
  });
});
