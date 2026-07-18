// 订阅与付费记录（ticket 03）：CRUD、记录驱动锚点改写、录入预填。

import { prisma } from "../db";
import {
  advanceCycle,
  type CycleSpec,
  type PaymentRec,
  type SubscriptionDef,
} from "../cost-engine";
import type { Payment, Subscription } from "@/generated/prisma/client";

export type SubscriptionWithPayments = Subscription & { payments: Payment[] };

export interface SubscriptionInput {
  name: string;
  category?: string;
  trackingMode: "CYCLE" | "MANUAL";
  cycleKind?: "CALENDAR" | "FIXED_DAYS";
  cycleUnit?: "DAY" | "WEEK" | "MONTH" | "YEAR";
  cycleCount?: number;
  fixedDays?: number;
  listPrice?: number;
  listCurrency?: string;
  listPriceBase?: number;
  autoRenew?: boolean;
  startDate: Date;
}

export interface PaymentInput {
  amount: number;
  currency: string;
  amountBase: number;
  refundedBase?: number;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
  source: "AUTO" | "MANUAL" | "PROMO" | "BUNDLE";
  note?: string;
}

function cycleSpecOf(sub: Subscription): CycleSpec | undefined {
  if (sub.cycleKind === "CALENDAR" && sub.cycleUnit && sub.cycleCount) {
    return {
      kind: "calendar",
      unit: sub.cycleUnit.toLowerCase() as "day" | "week" | "month" | "year",
      count: sub.cycleCount,
    };
  }
  if (sub.cycleKind === "FIXED_DAYS" && sub.fixedDays) {
    return { kind: "fixedDays", days: sub.fixedDays };
  }
  return undefined;
}

/** 映射为成本引擎输入（金额已是主币种快照） */
export function toEngineSub(sub: Subscription): SubscriptionDef {
  return {
    trackingMode: sub.trackingMode === "CYCLE" ? "cycle" : "manual",
    startDate: sub.startDate,
    anchorDate: sub.anchorDate ?? undefined,
    cycle: cycleSpecOf(sub),
    listPriceBase: sub.listPriceBase ?? undefined,
  };
}

export function toEnginePayments(payments: Payment[]): PaymentRec[] {
  return payments.map((p) => ({
    amountBase: p.amountBase,
    refundedBase: p.refundedBase,
    paidAt: p.paidAt,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
  }));
}

export async function createSubscription(
  ownerId: string,
  input: SubscriptionInput,
): Promise<Subscription> {
  if (input.trackingMode === "CYCLE") {
    const valid =
      (input.cycleKind === "CALENDAR" && input.cycleUnit && input.cycleCount) ||
      (input.cycleKind === "FIXED_DAYS" && input.fixedDays);
    if (!valid) throw new Error("周期模式需要完整的计费周期 cycle_required");
  }
  return prisma.subscription.create({
    data: {
      ownerId,
      name: input.name,
      category: input.category,
      trackingMode: input.trackingMode,
      cycleKind: input.trackingMode === "CYCLE" ? input.cycleKind : null,
      cycleUnit: input.trackingMode === "CYCLE" ? input.cycleUnit : null,
      cycleCount: input.trackingMode === "CYCLE" ? input.cycleCount : null,
      fixedDays: input.trackingMode === "CYCLE" ? input.fixedDays : null,
      anchorDate: input.startDate,
      listPrice: input.listPrice,
      listCurrency: input.listCurrency,
      listPriceBase: input.listPriceBase,
      autoRenew: input.autoRenew ?? true,
      startDate: input.startDate,
    },
  });
}

export async function listSubscriptions(ownerId: string): Promise<SubscriptionWithPayments[]> {
  return prisma.subscription.findMany({
    where: { ownerId, status: { not: "ARCHIVED" } },
    include: { payments: { orderBy: { periodStart: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSubscription(
  ownerId: string,
  id: string,
): Promise<SubscriptionWithPayments | null> {
  return prisma.subscription.findFirst({
    where: { id, ownerId },
    include: { payments: { orderBy: { periodStart: "asc" } } },
  });
}

/** 记一笔付费；周期模式下锚点改写为该记录的服务止期（ADR-0001） */
export async function recordPayment(
  ownerId: string,
  subscriptionId: string,
  input: PaymentInput,
): Promise<Payment> {
  const sub = await getSubscription(ownerId, subscriptionId);
  if (!sub) throw new Error("订阅不存在 subscription_not_found");
  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        subscriptionId,
        amount: input.amount,
        currency: input.currency,
        amountBase: input.amountBase,
        refundedBase: input.refundedBase ?? 0,
        paidAt: input.paidAt,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        source: input.source,
        note: input.note,
      },
    }),
    ...(sub.trackingMode === "CYCLE"
      ? [
          prisma.subscription.update({
            where: { id: subscriptionId },
            data: { anchorDate: input.periodEnd },
          }),
        ]
      : []),
  ]);
  return payment;
}

/** 新付费的预填区间：从最后止期（或锚定日期）起一个周期，金额为标准价 */
export function paymentPrefill(
  sub: Subscription,
  payments: Payment[],
): { periodStart: Date; periodEnd: Date; amountBase: number | null } {
  const lastEnd =
    payments.length > 0
      ? payments.reduce((max, p) => (p.periodEnd > max ? p.periodEnd : max), payments[0].periodEnd)
      : (sub.anchorDate ?? sub.startDate);
  const cycle = cycleSpecOf(sub);
  return {
    periodStart: lastEnd,
    periodEnd: cycle ? advanceCycle(lastEnd, cycle, 1) : lastEnd,
    amountBase: sub.listPriceBase,
  };
}

export async function setStatus(
  ownerId: string,
  id: string,
  status: "ACTIVE" | "CANCELLED" | "ARCHIVED",
) {
  await prisma.subscription.updateMany({ where: { id, ownerId }, data: { status } });
}
