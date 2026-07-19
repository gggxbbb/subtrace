// 物品（ticket 04）：CRUD 与卖出/报废登记；TCO 含订阅份额（ticket 07，ADR-0003）。

import { prisma } from "../db";
import { costSegments, dayDiff, type PurchaseDef } from "../cost-engine";
import { shareFor } from "../beneficiaries/service";
import { toEnginePayments, toEngineSub } from "../subscriptions/service";
import type { Purchase } from "@/generated/prisma/client";

export interface PurchaseInput {
  name: string;
  category?: string;
  amount: number;
  currency: string;
  amountBase: number;
  purchaseDate: Date;
  expectedDays?: number;
}

export function toEnginePurchase(p: Purchase): PurchaseDef {
  return {
    amountBase: p.amountBase,
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

export async function listPurchases(ownerId: string): Promise<Purchase[]> {
  return prisma.purchase.findMany({
    where: { ownerId },
    orderBy: { purchaseDate: "desc" },
  });
}

export async function getPurchase(ownerId: string, id: string): Promise<Purchase | null> {
  return prisma.purchase.findFirst({ where: { id, ownerId } });
}

/** 物品作为受益实体分担的订阅成本行 */
export interface SubscriptionShareLine {
  subscriptionId: string;
  name: string;
  /** 该物品在订阅中的份额（0–1） */
  share: number;
  /** 持有期内的份额成本（段按重叠天数折算） */
  amount: number;
}

/** 物品 TCO 的订阅部分：持有期内，其作为受益实体的订阅成本 × 份额 */
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
      const s = seg.start > holdingStart ? seg.start : holdingStart;
      const e = seg.end < holdingEnd ? seg.end : holdingEnd;
      if (e <= s) continue;
      amount += seg.net * (dayDiff(s, e) / dayDiff(seg.start, seg.end));
    }
    lines.push({ subscriptionId: sub.id, name: sub.name, share, amount: amount * share });
  }
  return lines;
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
