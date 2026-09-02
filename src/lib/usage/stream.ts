// 事件流引擎（ADR-0013 D1）：COUNT（Σ用量×单价）与 SAVINGS（Σ已省）共用周期窗口 + 分摊成本。
// 纯函数模块：不触 DB，调用方先取好数据与周期窗口。

import { actualCostPerUse, savingsVerdict, usageInPeriod, usageValuePriced } from "../cost-engine";
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
  /** 用量 × 替代单价（逐条记录级单价）；valueUnknown 时恒 0 */
  value: number;
  verdictAmount: number;
  costPerUse: number | null;
  /** 周期内有用量但全部记录无有效单价（记录与订阅替代单价均空，ticket 04）：
   *  净盈亏不可信，UI 灰显「价值未知」，次数与成本照常显示 */
  valueUnknown?: boolean;
  /** 周期内部分记录无单价：价值仅按有单价部分估值（UI 标注口径，净盈亏照常出数） */
  valuePartial?: boolean;
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

/** 事件流引擎：SAVINGS 增量求和即已省；COUNT 无单价记录放行（ticket 04）——全部无单价输出 valueUnknown，
 *  部分无单价按有单价部分估值并标注 valuePartial。传 forUserId 时成本 × 份额、用量只计本人。 */
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

  const entries = myRecords.map((r) => ({
    date: r.date,
    quantity: r.quantity,
    kind: r.kind as "DELTA" | "TOTAL",
    unitPrice: r.unitPrice ?? undefined,
  }));
  const usage = usageInPeriod(entries, period.start, period.end);
  const { value, pricedQty, unpricedQty } = usageValuePriced(
    entries,
    period.start,
    period.end,
    sub.altUnitPrice ?? null,
  );
  const valueUnknown = usage > 0 && pricedQty === 0 && unpricedQty > 0;
  const valuePartial = !valueUnknown && unpricedQty > 0;
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
    ...(valueUnknown ? { valueUnknown: true } : {}),
    ...(valuePartial ? { valuePartial: true } : {}),
  };
}
