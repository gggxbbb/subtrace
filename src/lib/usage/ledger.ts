// 账本引擎（ADR-0013 D1/D3）：QUOTA 形态的两套语义引擎。
// - RESET：周期闭式解——浪费 = 周期分摊成本 × (1 − used/total)；快照按 semantic 自描述读取。
// - STACKED：FEFO 包叠加账本（ADR-0012）；USED 快照按 total 折算为剩余。
// 纯函数模块：不触 DB，调用方先取好数据。

import { costSegments, coversDate, currentExpiry, dayDiff } from "../cost-engine";
import {
  toEngineSub,
  toEnginePayments,
  type SubscriptionWithPayments,
} from "../subscriptions/service";
import { shareForViewer } from "../beneficiaries/service";
import { periodCost } from "./period";
import { projectPackLedger, type PackInput, type RemainingSnapshot } from "./pack-ledger";
import type { Beneficiary, QuotaPack, UsageRecord } from "@/generated/prisma/client";

/** 快照语义（ADR-0013 记录自描述）：USED=已用量 | REMAINING=剩余量；DELTA 记录为空 */
export type UsageRecordSemantic = "USED" | "REMAINING";

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
  /** 超额率（used/total − 1；>0 时存在，未超额为 undefined） */
  overageRate?: number;
  /** 区间内首次用满 100% 的快照日期；未用满为 null */
  hit100At: Date | null;
  /** 没用满折算的浪费 = cost × (1 − usageRate) */
  wastedAmount: number;
  /** 每单位实际成本（如每 GB 成本） */
  costPerUnit: number | null;
  /** = −wastedAmount（≤0；用满为 0） */
  verdictAmount: number;
}

/** 包叠加盈亏（ADR-0012）：浪费导向，池级口径——余额/浪费不按受益人切片，forUserId 只切成本份额 */
export interface PackVerdict {
  kind: "PACK";
  periodStart: Date;
  periodEnd: Date;
  /** 当前服务区间净额（按份额；浪费本身池级不切） */
  cost: number;
  /** 覆盖段金额未知（ticket 12） */
  costUnknown?: boolean;
  /** 最新快照校准余额（池级） */
  balance: number;
  /** 最新快照日期（余额时效）；无快照为 null */
  balanceAt: Date | null;
  /** 快照陈旧天数（today − balanceAt）；无快照为 null；≥30 天 UI 变色 */
  staleDays: number | null;
  /** 下一到期包预警：projectedBalance = FEFO 模拟余额 */
  nextExpiry: { date: Date; quantity: number; projectedBalance: number } | null;
  /** 本区间已确认浪费（数量 + 金额）；verdictAmount = −amount */
  periodWaste: { quantity: number; amount: number };
  /** 累计已确认浪费 */
  totalWaste: { quantity: number; amount: number };
  /** 已确认浪费明细（按确认日倒序；事件带日期、不绑区间，续费后历史浪费仍可回看——spec story 23） */
  wasteEvents: { date: Date; quantity: number; amount: number }[];
  /** 累计推算消费（快照校准口径） */
  consumptionInferred: number;
  /** = −本区间确认浪费金额（≤0） */
  verdictAmount: number;
}

/**
 * RESET 闭式解（单一池，ADR-0013 D4）：浪费 = 周期分摊成本 × (1 − used/total)；记录按 semantic 读
 * （USED 原生 / REMAINING 折算 used = total − quantity）。池级口径——所有快照参与判定，不按 forUserId
 * 过滤；forUserId 仅把成本切成其份额（受益人的 verdict 看到池使用率，成本 × 份额）。
 * 总以周期内日期最新的有效快照为口径；超额（used > total）时 usageRate 封顶 1、overageRate 暴露超额。
 */
export function resetVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[] },
  records: UsageRecord[],
  forUserId: string | undefined,
  period: { start: Date; end: Date; net: number; unknown: boolean },
): QuotaVerdict | null {
  const share = forUserId ? shareForViewer(sub.beneficiaries ?? [], sub.ownerId, forUserId) : 1;
  const costShare = period.net * share;
  const inPeriod = records
    .filter((r) => r.kind === "TOTAL" && r.date >= period.start && r.date < period.end)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  // 语义折算：USED 原生；REMAINING = total − quantity；total 无效（≤0）跳过
  const usedOf = (r: UsageRecord): number | null => {
    const total = r.quotaTotal ?? sub.quotaTotal;
    if (total == null || total <= 0) return null;
    return r.semantic === "REMAINING" ? total - r.quantity : r.quantity;
  };
  const latest = [...inPeriod].reverse().find((r) => usedOf(r) != null);
  if (!latest) return null;
  const total = latest.quotaTotal ?? sub.quotaTotal;
  if (total == null || total <= 0) return null;
  const used = usedOf(latest)!;
  const rawRate = used / total;
  const usageRate = Math.min(rawRate, 1);
  const hit = inPeriod.find((r) => {
    const u = usedOf(r);
    const t = r.quotaTotal ?? sub.quotaTotal;
    return u != null && t != null && t > 0 && u >= t;
  });
  const wastedAmount = costShare * (1 - usageRate);
  return {
    kind: "QUOTA",
    periodStart: period.start,
    periodEnd: period.end,
    cost: costShare,
    costUnknown: period.unknown === true,
    used,
    total,
    usageRate,
    overageRate: rawRate > 1 ? rawRate - 1 : undefined,
    hit100At: hit?.date ?? null,
    wastedAmount,
    costPerUnit: used > 0 ? costShare / used : null,
    verdictAmount: -wastedAmount + 0, // 避免 -0
  };
}

/** 包叠加 verdict 装配：剩余快照 + 包列表 + 订阅到期日 → FEFO 推演 → 浪费口径盈亏。
 *  订阅已到期（expiry < today）时合成一条到期日 remaining=0 的快照，使停订即焚无需用户操作即显形。
 * 快照映射按 semantic 折算：USED 折算 remaining = total − quantity；REMAINING（或 null 防御性兼容存量）原生。
 *  periodOverride 传入（历史回看）：直接以该窗口为归因区间（止期排他），跳过覆盖/终止回落；
 *  净额按窗口与成本段相交日费率分摊。terminal = 订阅末窗（段序列无后续窗口承接到期日焚毁）→ 含端点归因。 */
export function packVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[]; quotaPacks?: QuotaPack[] },
  records: UsageRecord[],
  today: Date,
  forUserId: string | undefined,
  periodOverride?: { start: Date; end: Date },
  terminal?: boolean,
): PackVerdict | null {
  const engineSub = toEngineSub(sub);
  const payments = toEnginePayments(sub.payments);
  const segments = costSegments(engineSub, payments, today);
  const expiry = currentExpiry(engineSub, payments, today);
  let terminalAttribution = false;
  let period: { start: Date; end: Date; net: number; amountUnknown: boolean };
  if (periodOverride) {
    const pc = periodCost(segments, periodOverride.start, periodOverride.end);
    terminalAttribution = terminal === true;
    period = {
      start: periodOverride.start,
      end: periodOverride.end,
      net: pc.net,
      amountUnknown: pc.amountUnknown,
    };
  } else {
    const covering = segments.find((s) => coversDate(s, today));
    // 已到期：无覆盖段时取最后一段为归因区间（停订浪费确认在到期日 = 段末排他端点，含端点归因）
    terminalAttribution = !covering && segments.length > 0;
    const seg = covering ?? (terminalAttribution ? segments[segments.length - 1] : null);
    if (!seg) return null;
    period = { start: seg.start, end: seg.end, net: seg.net, amountUnknown: seg.amountUnknown === true };
  }
  const share = forUserId ? shareForViewer(sub.beneficiaries ?? [], sub.ownerId, forUserId) : 1;

  const packs: PackInput[] = (sub.quotaPacks ?? []).map((p) => ({
    grantedAt: p.grantedAt,
    quantity: p.quantity,
    expiresAt: p.expiresAt,
    source: p.source === "AUTO" ? "AUTO" : "MANUAL",
  }));
  // 池级快照（不按受益人切——共享池按人各记一遍即双倍计数）
  const snapshots: RemainingSnapshot[] = records.filter((r) => r.kind === "TOTAL").flatMap((r) => {
    const total = r.quotaTotal ?? sub.quotaTotal;
    // USED 记录折算为剩余：仅当总额度 > 0 才可折算，否则跳过（缺总量无法推演）
    if (r.semantic === "USED") {
      if (total == null || total <= 0) return [];
      return [{ date: r.date, remaining: total - r.quantity }];
    }
    // REMAINING（或 null semantic，防御性兼容存量）：quantity 即剩余
    return [{ date: r.date, remaining: r.quantity }];
  });
  if (expiry && dayDiff(today, expiry) < 0) {
    // 停订即焚：合成到期日 remaining=0 快照，终止日全量浪费立即确认
    snapshots.push({ date: expiry, remaining: 0 });
  }
  // 单张成本 = 发放段净额 ÷ 该段应发量。AUTO 段应发量 = 段内 AUTO 总量；
  // 段内有 AUTO 时 MANUAL 为赠送包（零成本不摊薄），无 AUTO（手动模式）时 MANUAL 即付费额度。
  const unitCostOf = (pack: PackInput): number => {
    const seg = segments.find((s) => coversDate(s, pack.grantedAt));
    if (!seg || seg.amountUnknown || seg.net <= 0) return 0;
    const inSeg = packs.filter((p) => coversDate(seg, p.grantedAt));
    const hasAuto = inSeg.some((p) => p.source === "AUTO");
    const basis = inSeg
      .filter((p) => (hasAuto ? p.source === "AUTO" : true))
      .reduce((s, p) => s + p.quantity, 0);
    if (pack.source === "MANUAL" && hasAuto) return 0;
    return basis > 0 ? seg.net / basis : 0;
  };

  const ledger = projectPackLedger({ packs, snapshots, subscriptionExpiry: expiry, unitCostOf });
  const inPeriod = ledger.waste.filter(
    (w) =>
      w.date >= period.start &&
      (terminalAttribution ? w.date <= period.end : w.date < period.end),
  );
  const periodWaste = {
    quantity: inPeriod.reduce((s, w) => s + w.quantity, 0),
    amount: inPeriod.reduce((s, w) => s + w.amount, 0),
  };
  return {
    kind: "PACK",
    periodStart: period.start,
    periodEnd: period.end,
    cost: period.net * share,
    costUnknown: period.amountUnknown === true,
    balance: ledger.balance,
    balanceAt: ledger.balanceAt,
    staleDays: ledger.balanceAt ? dayDiff(ledger.balanceAt, today) : null,
    nextExpiry: ledger.nextExpiry,
    periodWaste,
    totalWaste: {
      quantity: ledger.waste.reduce((s, w) => s + w.quantity, 0),
      amount: ledger.waste.reduce((s, w) => s + w.amount, 0),
    },
    wasteEvents: [...ledger.waste].sort((a, b) => b.date.getTime() - a.date.getTime()),
    consumptionInferred: ledger.consumptionInferred,
    verdictAmount: -periodWaste.amount + 0, // 避免 -0
  };
}
