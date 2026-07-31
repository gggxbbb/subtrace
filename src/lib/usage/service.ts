// 用量与盈亏（ticket 06）：计数型逐条 + 额度型快照，按当前服务区间算盈亏。

import { prisma } from "../db";
import {
  actualCostPerUse,
  costSegments,
  coversDate,
  savingsVerdict,
  usageInPeriod,
  usageValue,
  verdict,
} from "../cost-engine";
import {
  toEnginePayments,
  toEngineSub,
  type SubscriptionWithPayments,
} from "../subscriptions/service";
import type { Beneficiary, UsageRecord } from "@/generated/prisma/client";
import { shareForViewer } from "../beneficiaries/service";

export type UsageKind = "COUNT" | "QUOTA" | "SAVINGS";

export interface UsageConfigInput {
  usageKind: UsageKind;
  /** 省钱型忽略（落库置空） */
  usageUnit: string;
  altUnitPrice?: number;
  quotaTotal?: number;
}

export async function setUsageConfig(
  ownerId: string,
  subscriptionId: string,
  input: UsageConfigInput,
) {
  await prisma.subscription.updateMany({
    where: { id: subscriptionId, ownerId },
    data: {
      usageKind: input.usageKind,
      usageUnit: input.usageKind === "SAVINGS" ? null : input.usageUnit,
      altUnitPrice: input.usageKind === "COUNT" ? (input.altUnitPrice ?? null) : null,
      quotaTotal: input.usageKind === "QUOTA" ? (input.quotaTotal ?? null) : null,
    },
  });
}

/** 计数型：逐条录入用量（本次单价可选，默认继承订阅替代单价） */
export async function addUsage(
  actorId: string,
  subscriptionId: string,
  userId: string,
  input: { date: Date; quantity: number; unitPrice?: number },
): Promise<UsageRecord> {
  await assertUsageAllowed(actorId, subscriptionId);
  return prisma.usageRecord.create({
    data: { subscriptionId, userId, date: input.date, quantity: input.quantity, unitPrice: input.unitPrice, kind: "DELTA" },
  });
}

/** 额度型：录入已用量或百分比（百分比按当月总额度折算），单价/总额度可选快照 */
export async function addQuotaSnapshot(
  actorId: string,
  subscriptionId: string,
  userId: string,
  input: { date: Date; used?: number; percent?: number; unitPrice?: number; quotaTotal?: number },
): Promise<UsageRecord> {
  const sub = await assertUsageAllowed(actorId, subscriptionId);
  const quotaTotal = input.quotaTotal ?? sub.quotaTotal;
  let quantity = input.used;
  if (quantity == null && input.percent != null) {
    if (!quotaTotal) throw new Error("需要当月总额度 quota_total_required");
    quantity = (input.percent / 100) * quotaTotal;
  }
  if (quantity == null) throw new Error("需要已用量或百分比 usage_required");
  return prisma.usageRecord.create({
    data: { subscriptionId, userId, date: input.date, quantity, unitPrice: input.unitPrice, quotaTotal, kind: "TOTAL" },
  });
}

/** 省钱型：录入已省金额（amount 增量；cumulative 平台累计值自动与本区间已记求差，ADR-0011） */
export async function addSavings(
  actorId: string,
  subscriptionId: string,
  userId: string,
  input: { date: Date; amount?: number; cumulative?: number },
): Promise<UsageRecord> {
  const sub = await assertUsageAllowed(actorId, subscriptionId);
  if (sub.usageKind !== "SAVINGS") throw new Error("非省钱型订阅 not_savings_kind");
  if (input.amount != null && input.cumulative != null) {
    throw new Error("增量与累计值二选一 savings_ambiguous");
  }
  let quantity = input.amount;
  if (quantity == null) {
    if (input.cumulative == null) throw new Error("需要已省金额或累计值 savings_required");
    // 基准 = 该记录所在服务区间内、该用户已记的已省之和——会员期重置（新区间）时自然归零
    const withPayments = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { payments: true },
    });
    const covering = costSegments(
      toEngineSub(withPayments),
      toEnginePayments(withPayments.payments),
      input.date,
    ).find((s) => coversDate(s, input.date));
    const periodRecords = await prisma.usageRecord.findMany({
      where: {
        subscriptionId,
        userId,
        kind: "DELTA",
        ...(covering ? { date: { gte: covering.start, lt: covering.end } } : {}),
      },
    });
    const baseline = periodRecords.reduce((s, r) => s + r.quantity, 0);
    quantity = Math.round((input.cumulative - baseline) * 100) / 100;
    if (quantity <= 0) {
      throw new Error("累计值未超过本区间已记已省，若是新周期请改用增量录入 savings_not_increased");
    }
  }
  return prisma.usageRecord.create({
    data: { subscriptionId, userId, date: input.date, quantity, kind: "DELTA" },
  });
}

export async function deleteUsage(actorId: string, usageId: string) {
  // 所有者可删任何记录；受益人只能删自己的
  await prisma.usageRecord.deleteMany({
    where: {
      id: usageId,
      OR: [{ subscription: { ownerId: actorId } }, { userId: actorId }],
    },
  });
}

export async function listUsage(subscriptionId: string): Promise<UsageRecord[]> {
  return prisma.usageRecord.findMany({
    where: { subscriptionId },
    orderBy: { date: "asc" },
  });
}

/** 录入权限：所有者或 USER 类受益人（受益人记自己的用量） */
async function assertUsageAllowed(actorId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId } });
  if (!sub) throw new Error("订阅不存在 subscription_not_found");
  if (sub.ownerId === actorId) return sub;
  const ben = await prisma.beneficiary.findFirst({
    where: { subscriptionId, kind: "USER", userId: actorId },
  });
  if (!ben) throw new Error("订阅不存在 subscription_not_found");
  return sub;
}

export interface CountVerdict {
  kind: "COUNT";
  periodStart: Date;
  periodEnd: Date;
  /** 当前服务区间净额（全额） */
  cost: number;
  /** 覆盖段金额未知（ticket 12）：成本为 0 是「没记」，盈亏不可信 */
  costUnknown?: boolean;
  usage: number;
  /** 用量 × 替代单价（逐条记录级单价） */
  value: number;
  verdictAmount: number;
  costPerUse: number | null;
}

export interface QuotaVerdict {
  kind: "QUOTA";
  periodStart: Date;
  periodEnd: Date;
  /** 当前服务区间净额（全额） */
  cost: number;
  /** 覆盖段金额未知（ticket 12）：成本为 0 是「没记」，盈亏不可信 */
  costUnknown?: boolean;
  /** 最新快照的已用额度 */
  used: number;
  /** 最新快照的总额度 */
  total: number;
  /** 使用率（0–1，封顶 1） */
  usageRate: number;
  /** 区间内首次用满 100% 的快照日期；未用满为 null */
  hit100At: Date | null;
  /** 没用满折算的浪费 = cost × (1 − usageRate) */
  wastedAmount: number;
  /** 每单位实际成本（如每 GB 成本） */
  costPerUnit: number | null;
  /** = −wastedAmount（≤0；用满为 0） */
  verdictAmount: number;
}

export interface SavingsVerdict {
  kind: "SAVINGS";
  periodStart: Date;
  periodEnd: Date;
  /** 当前服务区间净额（按份额） */
  cost: number;
  /** 覆盖段金额未知（ticket 12）：成本为 0 是「没记」，盈亏不可信 */
  costUnknown?: boolean;
  /** 区间内已省金额合计（主币种，增量求和） */
  saved: number;
  /** = saved − cost（正=赚）；回本差额取反即得 */
  verdictAmount: number;
}

export type UsageVerdict = CountVerdict | QuotaVerdict | SavingsVerdict;

/** 当前服务区间的盈亏（覆盖 today 的成本段；无覆盖为 null）。
 *  传 forUserId 时按该受益人切片：成本 × 份额，用量只计其本人记录 */
export function getUsageVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[] },
  records: UsageRecord[],
  today: Date,
  forUserId?: string,
): UsageVerdict | null {
  if (!sub.usageKind) return null;
  const covering = costSegments(toEngineSub(sub), toEnginePayments(sub.payments), today).find((s) =>
    coversDate(s, today),
  );
  if (!covering) return null;
  const share = forUserId ? shareForViewer(sub.beneficiaries ?? [], sub.ownerId, forUserId) : 1;
  const costShare = covering.net * share;
  const costUnknown = covering.amountUnknown === true;
  const myRecords = forUserId ? records.filter((r) => r.userId === forUserId) : records;

  if (sub.usageKind === "QUOTA") {
    // 额度型：只看使用率——用到 100% 没有，什么时候用满；浪费 = 未用部分 × 成本
    const inPeriod = myRecords
      .filter((r) => r.kind === "TOTAL" && r.date >= covering.start && r.date < covering.end)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const latest = inPeriod[inPeriod.length - 1];
    if (!latest) return null;
    const effectiveTotal = (r: UsageRecord) => r.quotaTotal ?? sub.quotaTotal;
    const total = effectiveTotal(latest);
    if (total == null || total <= 0) return null;
    const used = latest.quantity;
    const usageRate = Math.min(used / total, 1);
    const hit = inPeriod.find((r) => {
      const t = effectiveTotal(r);
      return t != null && t > 0 && r.quantity >= t;
    });
    const wastedAmount = costShare * (1 - usageRate);
    return {
      kind: "QUOTA",
      periodStart: covering.start,
      periodEnd: covering.end,
      cost: costShare,
      costUnknown,
      used,
      total,
      usageRate,
      hit100At: hit?.date ?? null,
      wastedAmount,
      costPerUnit: used > 0 ? costShare / used : null,
      verdictAmount: -wastedAmount + 0, // 避免 -0
    };
  }

  if (sub.usageKind === "SAVINGS") {
    // 省钱型：增量求和即已省金额，盈亏 = Σ已省 − 已摊成本（ADR-0011）
    const saved = myRecords
      .filter((r) => r.kind === "DELTA" && r.date >= covering.start && r.date < covering.end)
      .reduce((s, r) => s + r.quantity, 0);
    return {
      kind: "SAVINGS",
      periodStart: covering.start,
      periodEnd: covering.end,
      cost: costShare,
      costUnknown,
      saved,
      verdictAmount: savingsVerdict(costShare, saved),
    };
  }

  if (sub.altUnitPrice == null) return null;
  const usage = usageInPeriod(
    myRecords.map((r) => ({ date: r.date, quantity: r.quantity, kind: r.kind as "DELTA" | "TOTAL" })),
    covering.start,
    covering.end,
  );
  const value = usageValue(
    myRecords.map((r) => ({
      date: r.date,
      quantity: r.quantity,
      kind: r.kind as "DELTA" | "TOTAL",
      unitPrice: r.unitPrice ?? undefined,
    })),
    covering.start,
    covering.end,
    sub.altUnitPrice ?? 0,
  );
  return {
    kind: "COUNT",
    periodStart: covering.start,
    periodEnd: covering.end,
    cost: costShare,
    costUnknown,
    usage,
    value,
    verdictAmount: value - costShare,
    costPerUse: actualCostPerUse(costShare, usage),
  };
}

/** 编辑用量记录（所有者或记录本人） */
export async function updateUsage(
  actorId: string,
  usageId: string,
  input: { date?: Date; quantity?: number; unitPrice?: number | null; quotaTotal?: number | null },
): Promise<void> {
  const rec = await prisma.usageRecord.findFirst({
    where: { id: usageId, OR: [{ subscription: { ownerId: actorId } }, { userId: actorId }] },
  });
  if (!rec) throw new Error("记录不存在 usage_not_found");
  await prisma.usageRecord.update({
    where: { id: usageId },
    data: {
      ...(input.date !== undefined && { date: input.date }),
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.unitPrice !== undefined && { unitPrice: input.unitPrice }),
      ...(input.quotaTotal !== undefined && { quotaTotal: input.quotaTotal }),
    },
  });
}
