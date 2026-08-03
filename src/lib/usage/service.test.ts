// 仓储缝测试：用量与盈亏（ticket 06）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
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
  listPacks,
  listUsage,
  nextAutoGrant,
  reconcileAutoPacks,
  setUsageConfig,
  updatePack,
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

  it("拒绝 used 与百分比入参；缺 remaining 拒绝", async () => {
    const sub = await cake();
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), used: 10 }),
    ).rejects.toThrow(/stacked_remaining_required/);
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), percent: 50 }),
    ).rejects.toThrow(/stacked_remaining_required/);
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15") }),
    ).rejects.toThrow(/stacked_remaining_required/);
  });

  it("RESET 订阅拒绝 remaining 入参（混录禁止）", async () => {
    const sub = await gym();
    await setUsageConfig(ownerId, sub.id, { usageKind: "QUOTA", usageUnit: "GB", quotaTotal: 1000 });
    await expect(
      addQuotaSnapshot(ownerId, sub.id, ownerId, { date: d("2026-07-15"), remaining: 800 }),
    ).rejects.toThrow(/reset_used_required/);
  });

  it("STACKED 订阅拒绝 DELTA 增量录入", async () => {
    const sub = await cake();
    await expect(
      addUsage(ownerId, sub.id, ownerId, { date: d("2026-07-15"), quantity: 1 }),
    ).rejects.toThrow(/stacked_no_delta/);
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
