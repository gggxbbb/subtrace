// 订阅与付费记录（ticket 03）：CRUD、记录驱动锚点改写、录入预填。

import { prisma } from "../db";
import {
  advanceCycle,
  type CycleSpec,
  type PaymentRec,
  type SubscriptionDef,
} from "../cost-engine";
import type { Payment, Subscription } from "@/generated/prisma/client";
import { beneficiaryInclude, type BeneficiaryWithRefs } from "../beneficiaries/service";

export type SubscriptionWithPayments = Subscription & { payments: Payment[] };
/** 含受益实体（用户/物品引用）与所有者名的订阅 */
export type SubscriptionWithRefs = SubscriptionWithPayments & {
  beneficiaries: BeneficiaryWithRefs[];
  owner: { username: string };
};

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
  /** BUNDLE 来源时指向联合会员 */
  bundleId?: string;
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

/** 订阅列表：自己拥有的 + 作为受益人被共享的 */
export async function listSubscriptions(userId: string): Promise<SubscriptionWithRefs[]> {
  return prisma.subscription.findMany({
    where: {
      status: { not: "ARCHIVED" },
      OR: [{ ownerId: userId }, { beneficiaries: { some: { userId } } }],
    },
    include: {
      payments: { orderBy: { periodStart: "asc" } },
      beneficiaries: { include: beneficiaryInclude },
      owner: { select: { username: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** 读取订阅：所有者或受益用户（受益用户只读，编辑操作仍走 ownerId 校验） */
export async function getSubscription(
  userId: string,
  id: string,
): Promise<SubscriptionWithRefs | null> {
  return prisma.subscription.findFirst({
    where: { id, OR: [{ ownerId: userId }, { beneficiaries: { some: { userId } } }] },
    include: {
      payments: { orderBy: { periodStart: "asc" } },
      beneficiaries: { include: beneficiaryInclude },
      owner: { select: { username: true } },
    },
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
        bundleId: input.bundleId,
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

/** 重算锚点：周期模式订阅的锚定日期 = 剩余付费记录的最大止期，无记录时回退起始日 */
async function recomputeAnchor(subscriptionId: string) {
  const sub = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { payments: true },
  });
  if (sub.trackingMode !== "CYCLE") return;
  const anchor =
    sub.payments.length > 0
      ? sub.payments.reduce((max, p) => (p.periodEnd > max ? p.periodEnd : max), sub.payments[0].periodEnd)
      : sub.startDate;
  await prisma.subscription.update({ where: { id: subscriptionId }, data: { anchorDate: anchor } });
}

/** 编辑付费记录（补登退款、修正区间等），周期模式锚点按最新最大止期重算 */
export async function updatePayment(
  ownerId: string,
  paymentId: string,
  input: Partial<PaymentInput>,
): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, subscription: { ownerId } },
  });
  if (!payment) throw new Error("付费记录不存在 payment_not_found");
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      amount: input.amount,
      currency: input.currency,
      amountBase: input.amountBase,
      refundedBase: input.refundedBase,
      paidAt: input.paidAt,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      source: input.source,
      note: input.note,
    },
  });
  await recomputeAnchor(payment.subscriptionId);
}

/** 删除付费记录，锚点回退到剩余记录的最大止期 */
export async function deletePayment(ownerId: string, paymentId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, subscription: { ownerId } },
  });
  if (!payment) return;
  await prisma.payment.delete({ where: { id: paymentId } });
  await recomputeAnchor(payment.subscriptionId);
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

/** 已归档订阅（仅自有） */
export async function listArchivedSubscriptions(ownerId: string) {
  return prisma.subscription.findMany({
    where: { ownerId, status: "ARCHIVED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, category: true, startDate: true },
  });
}

/** 硬删除订阅（付费/用量/受益人级联删除，不可恢复） */
export async function deleteSubscription(ownerId: string, id: string): Promise<void> {
  await prisma.subscription.deleteMany({ where: { id, ownerId } });
}

export async function setStatus(
  ownerId: string,
  id: string,
  status: "ACTIVE" | "CANCELLED" | "ARCHIVED",
) {
  await prisma.subscription.updateMany({ where: { id, ownerId }, data: { status } });
}

/** 编辑订阅基本信息（创建后仍可改；trackingMode 不可切换） */
export async function updateSubscription(
  ownerId: string,
  id: string,
  input: Partial<Omit<SubscriptionInput, "trackingMode">>,
): Promise<void> {
  await prisma.subscription.updateMany({
    where: { id, ownerId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.cycleKind !== undefined && { cycleKind: input.cycleKind }),
      ...(input.cycleUnit !== undefined && { cycleUnit: input.cycleUnit }),
      ...(input.cycleCount !== undefined && { cycleCount: input.cycleCount }),
      ...(input.fixedDays !== undefined && { fixedDays: input.fixedDays }),
      ...(input.listPrice !== undefined && { listPrice: input.listPrice }),
      ...(input.listCurrency !== undefined && { listCurrency: input.listCurrency }),
      ...(input.listPriceBase !== undefined && { listPriceBase: input.listPriceBase }),
      ...(input.autoRenew !== undefined && { autoRenew: input.autoRenew }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
    },
  });
}
