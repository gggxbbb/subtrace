// 用量与盈亏（ticket 06）：计数型逐条 + 额度型快照，按当前服务区间算盈亏。

import { prisma } from "../db";
import {
  actualCostPerUse,
  costSegments,
  usageInPeriod,
  usageValue,
  verdict,
} from "../cost-engine";
import {
  toEnginePayments,
  toEngineSub,
  type SubscriptionWithPayments,
} from "../subscriptions/service";
import type { UsageRecord } from "@/generated/prisma/client";

export interface UsageConfigInput {
  usageKind: "COUNT" | "QUOTA";
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
      usageUnit: input.usageUnit,
      altUnitPrice: input.usageKind === "COUNT" ? (input.altUnitPrice ?? null) : null,
      quotaTotal: input.usageKind === "QUOTA" ? (input.quotaTotal ?? null) : null,
    },
  });
}

/** 计数型：逐条录入用量（本次单价可选，默认继承订阅替代单价） */
export async function addUsage(
  ownerId: string,
  subscriptionId: string,
  userId: string,
  input: { date: Date; quantity: number; unitPrice?: number },
): Promise<UsageRecord> {
  await assertOwned(ownerId, subscriptionId);
  return prisma.usageRecord.create({
    data: { subscriptionId, userId, date: input.date, quantity: input.quantity, unitPrice: input.unitPrice, kind: "DELTA" },
  });
}

/** 额度型：录入已用量或百分比（百分比按当月总额度折算），单价/总额度可选快照 */
export async function addQuotaSnapshot(
  ownerId: string,
  subscriptionId: string,
  userId: string,
  input: { date: Date; used?: number; percent?: number; unitPrice?: number; quotaTotal?: number },
): Promise<UsageRecord> {
  const sub = await assertOwned(ownerId, subscriptionId);
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

export async function deleteUsage(ownerId: string, usageId: string) {
  await prisma.usageRecord.deleteMany({
    where: { id: usageId, subscription: { ownerId } },
  });
}

export async function listUsage(subscriptionId: string): Promise<UsageRecord[]> {
  return prisma.usageRecord.findMany({
    where: { subscriptionId },
    orderBy: { date: "asc" },
  });
}

async function assertOwned(ownerId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, ownerId } });
  if (!sub) throw new Error("订阅不存在 subscription_not_found");
  return sub;
}

export interface CountVerdict {
  kind: "COUNT";
  periodStart: Date;
  periodEnd: Date;
  /** 当前服务区间净额（全额） */
  cost: number;
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

export type UsageVerdict = CountVerdict | QuotaVerdict;

/** 当前服务区间的盈亏（覆盖 today 的成本段；无覆盖为 null） */
export function getUsageVerdict(
  sub: SubscriptionWithPayments,
  records: UsageRecord[],
  today: Date,
): UsageVerdict | null {
  if (!sub.usageKind) return null;
  const covering = costSegments(toEngineSub(sub), toEnginePayments(sub.payments), today).find(
    (s) => s.start <= today && today < s.end,
  );
  if (!covering) return null;

  if (sub.usageKind === "QUOTA") {
    // 额度型：只看使用率——用到 100% 没有，什么时候用满；浪费 = 未用部分 × 成本
    const inPeriod = records
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
    const wastedAmount = covering.net * (1 - usageRate);
    return {
      kind: "QUOTA",
      periodStart: covering.start,
      periodEnd: covering.end,
      cost: covering.net,
      used,
      total,
      usageRate,
      hit100At: hit?.date ?? null,
      wastedAmount,
      costPerUnit: used > 0 ? covering.net / used : null,
      verdictAmount: -wastedAmount + 0, // 避免 -0
    };
  }

  if (sub.altUnitPrice == null) return null;
  const usage = usageInPeriod(
    records.map((r) => ({ date: r.date, quantity: r.quantity, kind: r.kind as "DELTA" | "TOTAL" })),
    covering.start,
    covering.end,
  );
  const value = usageValue(
    records.map((r) => ({
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
    cost: covering.net,
    usage,
    value,
    verdictAmount: value - covering.net,
    costPerUse: actualCostPerUse(covering.net, usage),
  };
}
