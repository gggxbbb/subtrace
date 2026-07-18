// 物品（ticket 04）：CRUD 与卖出/报废登记。

import { prisma } from "../db";
import type { PurchaseDef } from "../cost-engine";
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
