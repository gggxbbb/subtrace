// 联合会员（ticket 05，ADR-0002）：打包付费 → 按原价比例分摊 → 物化 BUNDLE 付费记录。

import { prisma } from "../db";
import { allocateBundle } from "../cost-engine";
import { createSubscription, recordPayment } from "../subscriptions/service";
import type { Bundle, Payment, Subscription } from "@/generated/prisma/client";

export interface BundleItemInput {
  /** 关联已有订阅（与 newSubscription 二选一） */
  subscriptionId?: string;
  /** 新建订阅（名称必填） */
  newSubscription?: { name: string; category?: string };
  /** 单买原价（主币种）；未知为 null，按 0 参与分摊 */
  listPriceBase: number | null;
  /** 手动覆盖分摊额（默认按比例） */
  allocatedBase?: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface BundleInput {
  name: string;
  totalAmount: number;
  currency: string;
  totalAmountBase: number;
  periodStart: Date;
  periodEnd: Date;
  items: BundleItemInput[];
}

export type BundleWithPayments = Bundle & {
  payments: (Payment & { subscription: Subscription })[];
};

export async function createBundle(ownerId: string, input: BundleInput): Promise<Bundle> {
  if (input.items.length === 0) throw new Error("至少一个子会员 items_required");
  const allocations = allocateBundle(
    input.totalAmountBase,
    input.items.map((it) => it.listPriceBase ?? 0),
  );

  const bundle = await prisma.bundle.create({
    data: {
      ownerId,
      name: input.name,
      totalAmount: input.totalAmount,
      currency: input.currency,
      totalAmountBase: input.totalAmountBase,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  });

  for (const [i, item] of input.items.entries()) {
    let subscriptionId = item.subscriptionId;
    if (subscriptionId) {
      const owned = await prisma.subscription.findFirst({ where: { id: subscriptionId, ownerId } });
      if (!owned) throw new Error("关联的订阅不存在 subscription_not_found");
    } else {
      if (!item.newSubscription?.name.trim()) throw new Error("子会员需要名称 name_required");
      const sub = await createSubscription(ownerId, {
        name: item.newSubscription.name,
        category: item.newSubscription.category,
        trackingMode: "MANUAL",
        startDate: item.periodStart,
      });
      subscriptionId = sub.id;
    }
    await recordPayment(ownerId, subscriptionId, {
      amount: item.allocatedBase ?? allocations[i],
      currency: input.currency,
      amountBase: item.allocatedBase ?? allocations[i],
      paidAt: input.periodStart,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      source: "BUNDLE",
      bundleId: bundle.id,
      note: input.name,
    });
  }

  return bundle;
}

export async function listBundles(ownerId: string): Promise<BundleWithPayments[]> {
  return prisma.bundle.findMany({
    where: { ownerId },
    include: { payments: { include: { subscription: true } } },
    orderBy: { createdAt: "desc" },
  });
}
