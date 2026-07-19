// 物品（ticket 04）：CRUD 与卖出/报废登记；TCO 含订阅份额（ticket 07，ADR-0003）。

import { prisma } from "../db";
import { costSegments, currentDailyRate, currentExpiry, type PurchaseDef } from "../cost-engine";
import { shareFor } from "../beneficiaries/service";
import { toEnginePayments, toEngineSub } from "../subscriptions/service";
import type { Purchase, PurchaseEvent } from "@/generated/prisma/client";

/** 含事件的物品 */
type PurchaseWithEvents = Purchase & { events?: PurchaseEvent[] };

export interface PurchaseInput {
  name: string;
  category?: string;
  amount: number;
  currency: string;
  amountBase: number;
  purchaseDate: Date;
  expectedDays?: number;
}

export function toEnginePurchase(p: PurchaseWithEvents): PurchaseDef {
  return {
    amountBase: p.amountBase,
    extraBase: p.events?.reduce((s, e) => s + e.amountBase, 0) || undefined,
    extraDays: p.events?.reduce((s, e) => s + (e.extendDays ?? 0), 0) || undefined,
    resaleBase: p.resaleBase ?? undefined,
    purchaseDate: p.purchaseDate,
    expectedDays: p.expectedDays ?? undefined,
    status: p.status === "IN_USE" ? "in_use" : p.status === "SOLD" ? "sold" : "retired",
    endDate: p.endDate ?? undefined,
  };
}

export async function createPurchase(ownerId: string, input: PurchaseInput): Promise<Purchase> {
  return prisma.purchase.create({
    data: {
      ownerId,
      name: input.name,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      amountBase: input.amountBase,
      purchaseDate: input.purchaseDate,
      expectedDays: input.expectedDays,
    },
  });
}

export async function listPurchases(ownerId: string): Promise<PurchaseWithEvents[]> {
  return prisma.purchase.findMany({
    where: { ownerId, archived: false },
    include: { events: true },
    orderBy: { purchaseDate: "desc" },
  });
}

export async function getPurchase(ownerId: string, id: string): Promise<PurchaseWithEvents | null> {
  return prisma.purchase.findFirst({ where: { id, ownerId }, include: { events: true } });
}

/** 物品作为受益实体分担的订阅成本行 */
export interface SubscriptionShareLine {
  subscriptionId: string;
  name: string;
  /** 该物品在订阅中的份额（0–1） */
  share: number;
  /** 与持有期重叠的成本段 × 份额（段全额计入） */
  amount: number;
  /** 订阅当前到期日（无记录推算不出为 null） */
  expiry: Date | null;
  /** 订阅当日费率 × 份额（主币种/天） */
  dailyRateShare: number;
}

/** 物品 TCO 的订阅部分：与持有期重叠的成本段 × 份额（段全额计入——该份额是既成义务，不按天折算） */
export async function subscriptionShareCost(
  ownerId: string,
  purchase: Purchase,
  today: Date,
): Promise<SubscriptionShareLine[]> {
  const links = await prisma.beneficiary.findMany({
    where: { purchaseId: purchase.id, subscription: { ownerId } },
    include: {
      subscription: {
        include: {
          payments: { orderBy: { periodStart: "asc" } },
          beneficiaries: true,
        },
      },
    },
  });
  const holdingStart = purchase.purchaseDate;
  const holdingEnd = purchase.endDate ?? today;
  const lines: SubscriptionShareLine[] = [];
  for (const link of links) {
    const sub = link.subscription;
    const share = shareFor(sub.beneficiaries, sub.ownerId, purchase.id);
    if (share <= 0) continue;
    const segments = costSegments(toEngineSub(sub), toEnginePayments(sub.payments), holdingEnd);
    let amount = 0;
    for (const seg of segments) {
      // 与持有期有交集即整段计入
      if (seg.start < holdingEnd && holdingStart < seg.end) amount += seg.net;
    }
    lines.push({
      subscriptionId: sub.id,
      name: sub.name,
      share,
      amount: amount * share,
      expiry: currentExpiry(toEngineSub(sub), toEnginePayments(sub.payments), today),
      dailyRateShare: currentDailyRate(toEngineSub(sub), toEnginePayments(sub.payments), today) * share,
    });
  }
  return lines;
}

/** 记一笔收益（出租/返利等），抵减 TCO */
export async function addPurchaseIncome(
  ownerId: string,
  purchaseId: string,
  input: { amount: number; currency?: string; amountBase?: number; date: Date; note?: string },
) {
  const p = await prisma.purchase.findFirst({ where: { id: purchaseId, ownerId } });
  if (!p) throw new Error("物品不存在 purchase_not_found");
  return prisma.purchaseIncome.create({
    data: {
      purchaseId,
      amount: input.amount,
      currency: input.currency ?? "CNY",
      amountBase: input.amountBase ?? input.amount,
      date: input.date,
      note: input.note,
    },
  });
}

export async function deletePurchaseIncome(ownerId: string, incomeId: string) {
  await prisma.purchaseIncome.deleteMany({
    where: { id: incomeId, purchase: { ownerId } },
  });
}

export async function listPurchaseIncomes(purchaseId: string) {
  return prisma.purchaseIncome.findMany({
    where: { purchaseId },
    orderBy: { date: "asc" },
  });
}

/** 编辑物品基本信息（创建后仍可改） */
export async function updatePurchase(
  ownerId: string,
  id: string,
  input: Partial<PurchaseInput>,
): Promise<void> {
  await prisma.purchase.updateMany({
    where: { id, ownerId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.amountBase !== undefined && { amountBase: input.amountBase }),
      ...(input.purchaseDate !== undefined && { purchaseDate: input.purchaseDate }),
      ...(input.expectedDays !== undefined && { expectedDays: input.expectedDays }),
    },
  });
}

/** 卖出/报废登记：终止摊销，卖出记录残值 */
export async function closePurchase(
  ownerId: string,
  id: string,
  input: { status: "SOLD" | "RETIRED"; endDate: Date; resaleBase?: number },
): Promise<void> {
  await prisma.purchase.updateMany({
    where: { id, ownerId },
    data: {
      status: input.status,
      endDate: input.endDate,
      resaleBase: input.status === "SOLD" ? (input.resaleBase ?? 0) : null,
    },
  });
}

/** 归档/取消归档（隐藏于列表与统计） */
export async function setPurchaseArchived(ownerId: string, id: string, archived: boolean): Promise<void> {
  await prisma.purchase.updateMany({ where: { id, ownerId }, data: { archived } });
}

/** 硬删除物品（受益人/收益级联删除，不可恢复） */
export async function deletePurchase(ownerId: string, id: string): Promise<void> {
  await prisma.purchase.deleteMany({ where: { id, ownerId } });
}

/** 追加费用事件（配件/维修等）：计入净额共用摊销窗口；维修可延长寿命 */
export async function addPurchaseEvent(
  ownerId: string,
  purchaseId: string,
  input: {
    kind: "ACCESSORY" | "REPAIR" | "OTHER";
    amount: number;
    currency?: string;
    amountBase?: number;
    date: Date;
    extendDays?: number;
    note?: string;
  },
): Promise<PurchaseEvent> {
  const p = await prisma.purchase.findFirst({ where: { id: purchaseId, ownerId } });
  if (!p) throw new Error("物品不存在 purchase_not_found");
  return prisma.purchaseEvent.create({
    data: {
      purchaseId,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency ?? "CNY",
      amountBase: input.amountBase ?? input.amount,
      date: input.date,
      extendDays: input.extendDays,
      note: input.note,
    },
  });
}

export async function updatePurchaseEvent(
  ownerId: string,
  eventId: string,
  input: {
    kind?: "ACCESSORY" | "REPAIR" | "OTHER";
    amount?: number;
    amountBase?: number;
    date?: Date;
    extendDays?: number | null;
    note?: string | null;
  },
): Promise<void> {
  await prisma.purchaseEvent.updateMany({
    where: { id: eventId, purchase: { ownerId } },
    data: {
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.amountBase !== undefined && { amountBase: input.amountBase }),
      ...(input.date !== undefined && { date: input.date }),
      ...(input.extendDays !== undefined && { extendDays: input.extendDays }),
      ...(input.note !== undefined && { note: input.note }),
    },
  });
}

export async function deletePurchaseEvent(ownerId: string, eventId: string): Promise<void> {
  await prisma.purchaseEvent.deleteMany({
    where: { id: eventId, purchase: { ownerId } },
  });
}

export async function listPurchaseEvents(purchaseId: string): Promise<PurchaseEvent[]> {
  return prisma.purchaseEvent.findMany({
    where: { purchaseId },
    orderBy: { date: "asc" },
  });
}

/** 编辑收益记录 */
export async function updatePurchaseIncome(
  ownerId: string,
  incomeId: string,
  input: { amount?: number; currency?: string; amountBase?: number; date?: Date; note?: string | null },
): Promise<void> {
  await prisma.purchaseIncome.updateMany({
    where: { id: incomeId, purchase: { ownerId } },
    data: {
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.amountBase !== undefined && { amountBase: input.amountBase }),
      ...(input.date !== undefined && { date: input.date }),
      ...(input.note !== undefined && { note: input.note }),
    },
  });
}

/** 已归档物品 */
export async function listArchivedPurchases(ownerId: string) {
  return prisma.purchase.findMany({
    where: { ownerId, archived: true },
    orderBy: { purchaseDate: "desc" },
    select: { id: true, name: true, category: true, status: true, purchaseDate: true },
  });
}
