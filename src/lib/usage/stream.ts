// 事件流引擎（ADR-0013 D1）：COUNT（Σ用量×单价）与 SAVINGS（Σ已省）共用周期窗口 + 分摊成本。
// 纯函数模块：不触 DB，调用方先取好数据与周期窗口。

import { actualCostPerUse, savingsVerdict, usageInPeriod, usageValue } from "../cost-engine";
import type { SubscriptionWithPayments } from "../subscriptions/service";
import { shareForViewer } from "../beneficiaries/service";
import type { Beneficiary, UsageRecord } from "@/generated/prisma/client";

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

/** 事件流引擎：SAVINGS 增量求和即已省；COUNT 需替代单价（无则 null）。传 forUserId 时成本 × 份额、用量只计本人。 */
export function streamVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[] },
  records: UsageRecord[],
  forUserId: string | undefined,
  period: { start: Date; end: Date; net: number; unknown: boolean },
): CountVerdict | SavingsVerdict | null {
  const share = forUserId ? shareForViewer(sub.beneficiaries ?? [], sub.ownerId, forUserId) : 1;
  const costShare = period.net * share;
  const costUnknown = period.unknown;
  const myRecords = forUserId ? records.filter((r) => r.userId === forUserId) : records;

  if (sub.usageKind === "SAVINGS") {
    // 省钱型：增量求和即已省金额，盈亏 = Σ已省 − 已摊成本（ADR-0011）
    const saved = myRecords
      .filter((r) => r.kind === "DELTA" && r.date >= period.start && r.date < period.end)
      .reduce((s, r) => s + r.quantity, 0);
    return {
      kind: "SAVINGS",
      periodStart: period.start,
      periodEnd: period.end,
      cost: costShare,
      costUnknown,
      saved,
      verdictAmount: savingsVerdict(costShare, saved),
    };
  }

  if (sub.altUnitPrice == null) return null;
  const usage = usageInPeriod(
    myRecords.map((r) => ({ date: r.date, quantity: r.quantity, kind: r.kind as "DELTA" | "TOTAL" })),
    period.start,
    period.end,
  );
  const value = usageValue(
    myRecords.map((r) => ({
      date: r.date,
      quantity: r.quantity,
      kind: r.kind as "DELTA" | "TOTAL",
      unitPrice: r.unitPrice ?? undefined,
    })),
    period.start,
    period.end,
    sub.altUnitPrice ?? 0,
  );
  return {
    kind: "COUNT",
    periodStart: period.start,
    periodEnd: period.end,
    cost: costShare,
    costUnknown,
    usage,
    value,
    verdictAmount: value - costShare,
    costPerUse: actualCostPerUse(costShare, usage),
  };
}
