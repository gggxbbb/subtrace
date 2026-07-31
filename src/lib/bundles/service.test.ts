// 仓储缝测试：联合会员向导（ticket 05，ADR-0002）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { createSubscription, getSubscription } from "../subscriptions/service";
import { createBundle, listBundles } from "./service";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

let ownerId: string;

beforeEach(async () => {
  await prisma.payment.deleteMany();
  await prisma.bundle.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.session.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
});

const period = { periodStart: d("2026-07-18"), periodEnd: d("2027-07-18") };

describe("创建联合会员", () => {
  it("按原价比例分摊并物化 BUNDLE 付费记录（新建 + 关联已有）", async () => {
    const netdisk = await createSubscription(ownerId, {
      name: "百度网盘 SVIP",
      trackingMode: "CYCLE",
      cycleKind: "CALENDAR",
      cycleUnit: "YEAR",
      cycleCount: 1,
      listPrice: 263,
      listCurrency: "CNY",
      listPriceBase: 263,
      startDate: d("2026-01-01"),
    });

    const bundle = await createBundle(ownerId, {
      name: "88VIP 联名",
      totalAmount: 88,
      currency: "CNY",
      totalAmountBase: 88,
      ...period,
      items: [
        { newSubscription: { name: "优酷 VIP" }, listPriceBase: 198, ...period },
        { subscriptionId: netdisk.id, listPriceBase: 99, ...period },
      ],
    });

    // 优酷新建订阅，分摊 88×198/297 ≈ 58.67
    const youku = await prisma.subscription.findFirst({ where: { name: "优酷 VIP" } });
    expect(youku).not.toBeNull();
    const youkuPayment = await prisma.payment.findFirst({
      where: { subscriptionId: youku!.id, source: "BUNDLE" },
    });
    expect(youkuPayment!.amountBase).toBeCloseTo(88 * (198 / 297));
    expect(youkuPayment!.bundleId).toBe(bundle.id);

    // 网盘被关联：历史追加 BUNDLE 记录，锚点改写为权益止期
    const fresh = await getSubscription(ownerId, netdisk.id);
    const bundlePayment = fresh!.payments.find((p) => p.source === "BUNDLE");
    expect(bundlePayment!.amountBase).toBeCloseTo(88 * (99 / 297));
    expect(fresh!.anchorDate).toEqual(d("2027-07-18"));
  });

  it("混合分摊：手填项先占份额，自动池 = 总价 − 手填合计（ADR-0011 折扣权益场景）", async () => {
    await createBundle(ownerId, {
      name: "88VIP 联名",
      totalAmount: 88,
      currency: "CNY",
      totalAmountBase: 88,
      ...period,
      items: [
        { newSubscription: { name: "优酷 VIP" }, listPriceBase: 198, ...period },
        { newSubscription: { name: "网易云音乐" }, listPriceBase: 99, ...period },
        { newSubscription: { name: "淘宝折扣权益" }, listPriceBase: null, allocatedBase: 40, ...period },
      ],
    });
    const pay = async (name: string) => {
      const sub = await prisma.subscription.findFirst({ where: { name } });
      return (await prisma.payment.findFirst({ where: { subscriptionId: sub!.id } }))!.amountBase!;
    };
    // 自动池 88 − 40 = 48，按 198:99 比例分配；总额 = 打包实付
    expect(await pay("优酷 VIP")).toBeCloseTo(48 * (198 / 297));
    expect(await pay("网易云音乐")).toBeCloseTo(48 * (99 / 297));
    expect(await pay("淘宝折扣权益")).toBe(40);
    const total = (await pay("优酷 VIP")) + (await pay("网易云音乐")) + (await pay("淘宝折扣权益"));
    expect(total).toBeCloseTo(88);
  });

  it("手动覆盖分摊额生效", async () => {
    await createBundle(ownerId, {
      name: "自定义联名",
      totalAmount: 100,
      currency: "CNY",
      totalAmountBase: 100,
      ...period,
      items: [
        { newSubscription: { name: "A" }, listPriceBase: 100, allocatedBase: 70, ...period },
        { newSubscription: { name: "B" }, listPriceBase: 100, allocatedBase: 30, ...period },
      ],
    });
    const a = await prisma.subscription.findFirst({ where: { name: "A" } });
    const aPayment = await prisma.payment.findFirst({ where: { subscriptionId: a!.id } });
    expect(aPayment!.amountBase).toBe(70);
  });

  it("原价未知的子会员按 0 分摊", async () => {
    await createBundle(ownerId, {
      name: "含赠品联名",
      totalAmount: 88,
      currency: "CNY",
      totalAmountBase: 88,
      ...period,
      items: [
        { newSubscription: { name: "主会员" }, listPriceBase: 198, ...period },
        { newSubscription: { name: "赠品听书" }, listPriceBase: null, ...period },
      ],
    });
    const gift = await prisma.subscription.findFirst({ where: { name: "赠品听书" } });
    const giftPayment = await prisma.payment.findFirst({ where: { subscriptionId: gift!.id } });
    expect(giftPayment!.amountBase).toBe(0);
  });

  it("listBundles 返回打包与分摊明细", async () => {
    await createBundle(ownerId, {
      name: "88VIP 联名",
      totalAmount: 88,
      currency: "CNY",
      totalAmountBase: 88,
      ...period,
      items: [{ newSubscription: { name: "优酷 VIP" }, listPriceBase: 198, ...period }],
    });
    const bundles = await listBundles(ownerId);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].name).toBe("88VIP 联名");
    expect(bundles[0].payments).toHaveLength(1);
    expect(bundles[0].payments[0].subscription.name).toBe("优酷 VIP");
  });
});
