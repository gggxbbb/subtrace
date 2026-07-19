// 仓储缝测试：订阅与付费记录（ticket 03）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { currentExpiry, costSegments } from "../cost-engine";
import {
  applyRechain,
  createSubscription,
  planRechain,
  deletePayment,
  getSubscription,
  listSubscriptions,
  paymentPrefill,
  recordPayment,
  setStatus,
  toEnginePayments,
  toEngineSub,
  updatePayment,
} from "./service";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

let ownerId: string;
let otherId: string;

beforeEach(async () => {
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (
    await prisma.user.create({ data: { username: "me", passwordHash: "x" } })
  ).id;
  otherId = (
    await prisma.user.create({ data: { username: "other", passwordHash: "x" } })
  ).id;
});

const cycleInput = {
  name: "哔哩哔哩大会员",
  category: "视频",
  trackingMode: "CYCLE" as const,
  cycleKind: "CALENDAR" as const,
  cycleUnit: "YEAR" as const,
  cycleCount: 1,
  listPrice: 148,
  listCurrency: "CNY",
  listPriceBase: 148,
  startDate: d("2026-01-22"),
};

describe("创建订阅", () => {
  it("周期模式：锚定日期默认为起始日", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    expect(sub.anchorDate).toEqual(d("2026-01-22"));
    expect(sub.status).toBe("ACTIVE");
  });

  it("周期模式缺周期字段拒绝", async () => {
    await expect(
      createSubscription(ownerId, { ...cycleInput, cycleUnit: undefined }),
    ).rejects.toThrow(/cycle|周期/i);
  });

  it("手动模式不需要周期字段", async () => {
    const sub = await createSubscription(ownerId, {
      name: "灵活会员",
      trackingMode: "MANUAL" as const,
      startDate: d("2026-01-01"),
    });
    expect(sub.trackingMode).toBe("MANUAL");
  });

  it("列表按用户隔离", async () => {
    await createSubscription(ownerId, cycleInput);
    expect(await listSubscriptions(ownerId)).toHaveLength(1);
    expect(await listSubscriptions(otherId)).toHaveLength(0);
    expect(await getSubscription(otherId, (await listSubscriptions(ownerId))[0].id)).toBeNull();
  });
});

describe("付费记录（ADR-0001 记录驱动）", () => {
  it("记一笔付费后到期日更新为记录的服务止期，锚点被改写", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: 108,
      currency: "CNY",
      amountBase: 108,
      paidAt: d("2026-07-10"),
      periodStart: d("2026-07-10"),
      periodEnd: d("2027-07-15"), // 活动价 370 天
      source: "PROMO",
    });
    const fresh = await getSubscription(ownerId, sub.id);
    expect(fresh!.anchorDate).toEqual(d("2027-07-15"));
    expect(
      currentExpiry(toEngineSub(fresh!), toEnginePayments(fresh!.payments), d("2026-07-18")),
    ).toEqual(d("2027-07-15"));
  });

  it("退款金额使成本按净额计算", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: 148,
      currency: "CNY",
      amountBase: 148,
      refundedBase: 148,
      paidAt: d("2026-07-10"),
      periodStart: d("2026-07-10"),
      periodEnd: d("2027-01-22"),
      source: "AUTO",
    });
    const fresh = await getSubscription(ownerId, sub.id);
    const segs = costSegments(toEngineSub(fresh!), toEnginePayments(fresh!.payments), d("2026-07-18"));
    expect(segs.find((s) => !s.estimated)!.net).toBe(0);
  });

  it("预填：无记录时从锚定日期起一个周期，有记录时从最后止期顺延", async () => {
    const sub = await createSubscription(ownerId, {
      ...cycleInput,
      cycleUnit: "MONTH" as const,
      listPriceBase: 25,
    });
    const first = paymentPrefill(sub, []);
    expect(first.periodStart).toEqual(d("2026-01-22"));
    expect(first.periodEnd).toEqual(d("2026-02-22"));
    expect(first.amountBase).toBe(25);

    await recordPayment(ownerId, sub.id, {
      amount: 25,
      currency: "CNY",
      amountBase: 25,
      paidAt: d("2026-01-22"),
      periodStart: d("2026-01-22"),
      periodEnd: d("2026-02-22"),
      source: "AUTO",
    });
    const fresh = await getSubscription(ownerId, sub.id);
    const second = paymentPrefill(fresh!, fresh!.payments);
    expect(second.periodStart).toEqual(d("2026-02-22"));
    expect(second.periodEnd).toEqual(d("2026-03-22"));
  });

  it("状态可标记为已取消/归档", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await setStatus(ownerId, sub.id, "CANCELLED");
    expect((await getSubscription(ownerId, sub.id))!.status).toBe("CANCELLED");
    await setStatus(ownerId, sub.id, "ARCHIVED");
    expect((await getSubscription(ownerId, sub.id))!.status).toBe("ARCHIVED");
  });
});

describe("付费记录编辑与删除", () => {
  it("编辑记录：补登退款与修改区间，锚点按最新最大止期重算", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    const p1 = await recordPayment(ownerId, sub.id, {
      amount: 148, currency: "CNY", amountBase: 148,
      paidAt: d("2026-01-22"), periodStart: d("2026-01-22"), periodEnd: d("2027-01-22"), source: "AUTO",
    });
    await updatePayment(ownerId, p1.id, { refundedBase: 100, periodEnd: d("2026-05-01") });
    const fresh = await getSubscription(ownerId, sub.id);
    expect(fresh!.payments[0].refundedBase).toBe(100);
    expect(fresh!.payments[0].periodEnd).toEqual(d("2026-05-01"));
    expect(fresh!.anchorDate).toEqual(d("2026-05-01"));
  });

  it("删除记录后锚点回退到剩余记录的最大止期", async () => {
    const sub = await createSubscription(ownerId, cycleInput);
    await recordPayment(ownerId, sub.id, {
      amount: 148, currency: "CNY", amountBase: 148,
      paidAt: d("2026-01-22"), periodStart: d("2026-01-22"), periodEnd: d("2027-01-22"), source: "AUTO",
    });
    const p2 = await recordPayment(ownerId, sub.id, {
      amount: 108, currency: "CNY", amountBase: 108,
      paidAt: d("2027-01-10"), periodStart: d("2027-01-22"), periodEnd: d("2028-01-22"), source: "PROMO",
    });
    await deletePayment(ownerId, p2.id);
    const fresh = await getSubscription(ownerId, sub.id);
    expect(fresh!.payments).toHaveLength(1);
    expect(fresh!.anchorDate).toEqual(d("2027-01-22"));
  });
});

describe("链式重排（退款缩期/删笔后的后续调整）", () => {
  const pay = async (subId: string, amount: number, start: string, end: string) =>
    prisma.payment.create({
      data: {
        subscriptionId: subId, amount, currency: "CNY", amountBase: amount,
        paidAt: d(start), periodStart: d(start), periodEnd: d(end), source: "MANUAL",
      },
    });

  it("链连续时无提议", async () => {
    const sub = await createSubscription(ownerId, {
      name: "连续会员", trackingMode: "MANUAL", startDate: d("2026-01-01"),
    });
    await pay(sub.id, 100, "2026-01-01", "2026-04-01");
    await pay(sub.id, 100, "2026-04-01", "2026-07-01");
    const fresh = (await getSubscription(ownerId, sub.id))!;
    expect(planRechain(fresh.payments)).toBeNull();
  });

  it("中段缩短 → 提议后续整体前移，确认后链恢复连续", async () => {
    const sub = await createSubscription(ownerId, {
      name: "连续会员", trackingMode: "MANUAL", startDate: d("2026-01-01"),
    });
    await pay(sub.id, 100, "2026-01-01", "2026-04-01");
    const p2 = await pay(sub.id, 100, "2026-04-01", "2026-07-01");
    const p3 = await pay(sub.id, 100, "2026-07-01", "2026-10-01");
    // 第二笔退款缩期：止期提前到 05-01
    await updatePayment(ownerId, p2.id, { periodEnd: d("2026-05-01") });
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const plan = planRechain(fresh.payments);
    expect(plan).not.toBeNull();
    expect(plan!.shifts).toHaveLength(1);
    expect(plan!.shifts[0].paymentId).toBe(p3.id);
    expect(plan!.shifts[0].deltaDays).toBe(-61); // 07-01 → 05-01
    await applyRechain(ownerId, sub.id);
    const after = (await getSubscription(ownerId, sub.id))!;
    const sorted = [...after.payments].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
    expect(sorted[1].periodEnd).toEqual(d("2026-05-01"));
    expect(sorted[2].periodStart).toEqual(d("2026-05-01"));
    expect(sorted[2].periodEnd).toEqual(d("2026-08-01")); // 时长保持 92 天
  });

  it("删中间笔 → 断裂后提议前移后续", async () => {
    const sub = await createSubscription(ownerId, {
      name: "连续会员", trackingMode: "MANUAL", startDate: d("2026-01-01"),
    });
    await pay(sub.id, 100, "2026-01-01", "2026-04-01");
    const p2 = await pay(sub.id, 100, "2026-04-01", "2026-07-01");
    await pay(sub.id, 100, "2026-07-01", "2026-10-01");
    await deletePayment(ownerId, p2.id);
    const fresh = (await getSubscription(ownerId, sub.id))!;
    const plan = planRechain(fresh.payments);
    expect(plan).not.toBeNull();
    expect(plan!.shifts[0].deltaDays).toBe(-91); // p3 前移到 04-01（4~6月=91天）
  });
});

describe("金额未知的付费记录（ticket 12）", () => {
  it("金额可缺省：记录落 null，到期日/区间照常，成本段费率为 0", async () => {
    const sub = await createSubscription(ownerId, {
      name: "只知道到期日的老订阅",
      trackingMode: "MANUAL",
      startDate: d("2026-01-01"),
    });
    const p = await recordPayment(ownerId, sub.id, {
      amount: null,
      amountBase: null,
      paidAt: d("2026-06-15"),
      periodStart: d("2026-06-15"),
      periodEnd: d("2026-07-15"),
      source: "MANUAL",
    });
    expect(p.amount).toBeNull();
    expect(p.amountBase).toBeNull();
    expect(p.currency).toBeNull();

    const fresh = await getSubscription(ownerId, sub.id);
    const engineSub = toEngineSub(fresh!);
    const payments = toEnginePayments(fresh!.payments);
    expect(currentExpiry(engineSub, payments, d("2026-06-20"))).toEqual(d("2026-07-15"));
    const segs = costSegments(engineSub, payments, d("2026-06-20"));
    expect(segs[0]).toMatchObject({ amountUnknown: true, net: 0 });
  });

  it("补录金额：updatePayment 填回金额后段恢复费率", async () => {
    const sub = await createSubscription(ownerId, {
      name: "补录",
      trackingMode: "MANUAL",
      startDate: d("2026-01-01"),
    });
    const p = await recordPayment(ownerId, sub.id, {
      amount: null,
      amountBase: null,
      paidAt: d("2026-06-15"),
      periodStart: d("2026-06-15"),
      periodEnd: d("2026-07-15"),
      source: "MANUAL",
    });
    await updatePayment(ownerId, p.id, { amount: 30, currency: "CNY", amountBase: 30 });
    const fresh = await getSubscription(ownerId, sub.id);
    const segs = costSegments(toEngineSub(fresh!), toEnginePayments(fresh!.payments), d("2026-06-20"));
    expect(segs[0]).toMatchObject({ amountUnknown: false, net: 30 });
  });
});
