// 联合会员（ticket 05，ADR-0002）：打包付费 → 按原价比例分摊 → 物化 BUNDLE 付费记录。

import { prisma } from "../db";
import { allocateBundle } from "../cost-engine";
import { createSubscription, deletePayment, recordPayment } from "../subscriptions/service";
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
  await materializeItems(ownerId, bundle.id, input);
  return bundle;
}

/** 物料化子会员：按比例分摊 → 每个 item 一条 BUNDLE 付费记录（新子会员顺带建订阅） */
async function materializeItems(ownerId: string, bundleId: string, input: BundleInput) {
  const allocations = allocateBundle(
    input.totalAmountBase,
    input.items.map((it) => it.listPriceBase ?? 0),
  );
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
      bundleId,
      note: input.name,
    });
  }
}

/**
 * 编辑联合会员 = 重走向导：更新主体字段，全量对账子会员——
 * 删除旧的 BUNDLE 付费记录，按新配置重新分摊物料化。
 */
export async function replaceBundle(ownerId: string, id: string, input: BundleInput): Promise<void> {
  if (input.items.length === 0) throw new Error("至少一个子会员 items_required");
  const bundle = await prisma.bundle.findFirst({
    where: { id, ownerId },
    include: { payments: true },
  });
  if (!bundle) throw new Error("联合会员不存在 bundle_not_found");
  for (const p of bundle.payments) {
    await deletePayment(ownerId, p.id);
  }
  await prisma.bundle.updateMany({
    where: { id, ownerId },
    data: {
      name: input.name,
      totalAmount: input.totalAmount,
      currency: input.currency,
      totalAmountBase: input.totalAmountBase,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  });
  await materializeItems(ownerId, id, input);
}

export async function listBundles(ownerId: string): Promise<BundleWithPayments[]> {
  return prisma.bundle.findMany({
    where: { ownerId, archived: false },
    include: { payments: { include: { subscription: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** 编辑联合会员主体（名称/金额/区间）；各子会员分摊额在付费管理页改 */
export async function updateBundle(
  ownerId: string,
  id: string,
  input: Partial<Pick<BundleInput, "name" | "totalAmount" | "currency" | "totalAmountBase" | "periodStart" | "periodEnd">>,
): Promise<void> {
  await prisma.bundle.updateMany({
    where: { id, ownerId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.totalAmount !== undefined && { totalAmount: input.totalAmount }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.totalAmountBase !== undefined && { totalAmountBase: input.totalAmountBase }),
      ...(input.periodStart !== undefined && { periodStart: input.periodStart }),
      ...(input.periodEnd !== undefined && { periodEnd: input.periodEnd }),
    },
  });
}

export async function getBundle(ownerId: string, id: string): Promise<BundleWithPayments | null> {
  return prisma.bundle.findFirst({
    where: { id, ownerId },
    include: { payments: { include: { subscription: true } } },
  });
}

/** 归档/取消归档 */
export async function setBundleArchived(ownerId: string, id: string, archived: boolean): Promise<void> {
  await prisma.bundle.updateMany({ where: { id, ownerId }, data: { archived } });
}

/** 已归档联合会员 */
export async function listArchivedBundles(ownerId: string) {
  return prisma.bundle.findMany({
    where: { ownerId, archived: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, totalAmountBase: true, periodStart: true, periodEnd: true },
  });
}

/** 硬删除联合会员；各子会员的付费记录保留（bundleId 置空，ADR-0002） */
export async function deleteBundle(ownerId: string, id: string): Promise<void> {
  await prisma.bundle.deleteMany({ where: { id, ownerId } });
}
