// 用量与盈亏（ticket 06）：计数型逐条 + 额度型快照，按当前服务区间算盈亏。

import { prisma } from "../db";
import { advanceCycle, costSegments, coversDate, currentExpiry, dayDiff, type CycleSpec, type PaymentRec, type SubscriptionDef } from "../cost-engine";
import {
  toEnginePayments,
  toEngineSub,
  type SubscriptionWithPayments,
} from "../subscriptions/service";
import type { Beneficiary, QuotaPack, Subscription, UsageRecord } from "@/generated/prisma/client";
import { currentUsagePeriod, periodCost, usagePeriods } from "./period";
import { dayStart, today } from "../dates";
import { packVerdict, resetVerdict, type PackVerdict, type QuotaVerdict } from "./ledger";
import { streamVerdict, type CountVerdict, type SavingsVerdict } from "./stream";

export type { CountVerdict, SavingsVerdict } from "./stream";
export type { QuotaVerdict, PackVerdict, UsageRecordSemantic } from "./ledger";
export type UsageVerdict = CountVerdict | QuotaVerdict | SavingsVerdict | PackVerdict;

export type UsageKind = "COUNT" | "QUOTA" | "SAVINGS";
/** 发放形态（ADR-0012）：空 = RESET | STACKED（包叠加）；仅 QUOTA 有意义 */
export type GrantMode = "RESET" | "STACKED";
/** 独立用量周期单位（ADR-0013）：DAY | WEEK | MONTH | YEAR */
export type UsageCycleUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface UsageConfigInput {
  usageKind: UsageKind;
  /** 省钱型忽略（落库置空） */
  usageUnit: string;
  altUnitPrice?: number;
  quotaTotal?: number;
  /** 仅 QUOTA 可设；空/RESET 落库置空（存量零迁移） */
  grantMode?: GrantMode;
  /** STACKED：包有效期（日历月） */
  packValidMonths?: number;
  /** 用量周期（ADR-0013）：独立于计费周期；空 = QUOTA 回退计费周期 / COUNT·SAVINGS 回退成本段 */
  usageCycleUnit?: UsageCycleUnit;
  usageCycleCount?: number;
  /** 用量周期锚定日；空 = 订阅锚定日期（anchorDate ?? startDate） */
  usageCycleAnchor?: Date;
}

export async function setUsageConfig(
  ownerId: string,
  subscriptionId: string,
  input: UsageConfigInput,
) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, ownerId } });
  if (!sub) throw new Error("订阅不存在 subscription_not_found");
  const stacked = input.usageKind === "QUOTA" && input.grantMode === "STACKED";
  // 手动模式 + STACKED：无周期可推导发放计划，清空下发量/有效期，包全部手动录入（ADR-0012）
  const keepPackFields = stacked && sub.trackingMode === "CYCLE";
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      usageKind: input.usageKind,
      usageUnit: input.usageKind === "SAVINGS" ? null : input.usageUnit,
      altUnitPrice: input.usageKind === "COUNT" ? (input.altUnitPrice ?? null) : null,
      quotaTotal:
        input.usageKind === "QUOTA" && !(stacked && !keepPackFields)
          ? (input.quotaTotal ?? null)
          : null,
      grantMode: stacked ? "STACKED" : null,
      packValidMonths: keepPackFields ? (input.packValidMonths ?? null) : null,
      usageCycleUnit: input.usageCycleUnit ?? null,
      usageCycleCount: input.usageCycleCount ?? null,
      usageCycleAnchor: input.usageCycleAnchor ?? null,
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
  const sub = await assertUsageAllowed(actorId, subscriptionId);
  if (input.quantity < 0) throw new Error("用量不能为负 usage_negative");
  if (dayDiff(today(), input.date) > 0) throw new Error("不能录入未来日期 future_date");
  if (sub.usageKind === "QUOTA" && sub.grantMode === "STACKED") {
    throw new Error("包叠加形态只收剩余快照 stacked_no_delta");
  }
  return prisma.usageRecord.create({
    data: { subscriptionId, userId, date: input.date, quantity: input.quantity, unitPrice: input.unitPrice, kind: "DELTA" },
  });
}

/** 额度型快照：形态无关的 shape 判定（ADR-0013 D3/D6）——剩余量 → REMAINING；已用量/百分比 → USED。
 *  语义随记录落库（self-describing），RESET 与 STACKED 均按记录自描述读取。source 供脚本任务标记 SCRIPT */
export async function addQuotaSnapshot(
  actorId: string,
  subscriptionId: string,
  userId: string,
  input: { date: Date; used?: number; percent?: number; remaining?: number; unitPrice?: number; quotaTotal?: number; source?: string },
): Promise<UsageRecord> {
  const sub = await assertUsageAllowed(actorId, subscriptionId);
  // 单一池规则（ADR-0013 D4）：额度快照仅所有者可录；流式形态（COUNT/SAVINGS）仍按人各自记录
  if (sub.usageKind === "QUOTA" && actorId !== sub.ownerId) {
    throw new Error("额度池快照仅所有者可录 quota_owner_only");
  }
  if (input.used != null && input.percent != null) {
    throw new Error("已用量与百分比二选一 quota_used_percent_ambiguous");
  }
  if (input.used != null && input.used < 0) {
    throw new Error("已用量不能为负 quota_used_negative");
  }
  if (input.percent != null && input.percent < 0) {
    throw new Error("百分比不能为负 quota_percent_negative");
  }
  if (dayDiff(today(), input.date) > 0) throw new Error("不能录入未来日期 future_date");
  if (input.remaining != null && (input.used != null || input.percent != null)) {
    throw new Error("剩余与已用量/百分比二选一 quota_snapshot_ambiguous");
  }
  if (input.remaining != null) {
    return prisma.usageRecord.create({
      data: { subscriptionId, userId, date: input.date, quantity: input.remaining, kind: "TOTAL", semantic: "REMAINING", source: input.source ?? "MANUAL" },
    });
  }
  const quotaTotal = input.quotaTotal ?? sub.quotaTotal;
  let quantity = input.used;
  if (quantity == null && input.percent != null) {
    if (!quotaTotal) throw new Error("需要当月总额度 quota_total_required");
    quantity = (input.percent / 100) * quotaTotal;
  }
  if (quantity == null) throw new Error("需要已用量或百分比 usage_required");
  return prisma.usageRecord.create({
    data: { subscriptionId, userId, date: input.date, quantity, unitPrice: input.unitPrice, quotaTotal, kind: "TOTAL", semantic: "USED", source: input.source ?? "MANUAL" },
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
  if (input.amount != null && input.amount < 0) throw new Error("已省金额不能为负 savings_negative");
  if (dayDiff(today(), input.date) > 0) throw new Error("不能录入未来日期 future_date");
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

// ===== 额度包（ADR-0012）：手动包增删改；AUTO 行由生成器维护（ticket 03），永不手触 =====

export async function listPacks(subscriptionId: string): Promise<QuotaPack[]> {
  return prisma.quotaPack.findMany({
    where: { subscriptionId },
    orderBy: [{ grantedAt: "asc" }, { createdAt: "asc" }],
  });
}

/** 手动补录额度包（仅所有者；订阅须为 QUOTA + STACKED） */
export async function addPack(
  actorId: string,
  subscriptionId: string,
  input: { grantedAt: Date; quantity: number; expiresAt: Date },
): Promise<QuotaPack> {
  const sub = await prisma.subscription.findFirst({
    where: { id: subscriptionId, ownerId: actorId },
    include: { payments: true },
  });
  if (!sub) throw new Error("订阅不存在 subscription_not_found");
  if (sub.usageKind !== "QUOTA" || sub.grantMode !== "STACKED") {
    throw new Error("非包叠加形态 not_stacked");
  }
  if (dayDiff(input.expiresAt, input.grantedAt) > 0) {
    throw new Error("发放日不能晚于到期日 pack_invalid_range");
  }
  const expiry = currentExpiry(toEngineSub(sub), toEnginePayments(sub.payments), today());
  if (expiry && dayDiff(expiry, input.grantedAt) > 0) {
    throw new Error("发放日不能晚于订阅到期 pack_after_expiry");
  }
  if (dayDiff(today(), input.grantedAt) > 0) {
    throw new Error("不能录入未来日期 future_date");
  }
  return prisma.quotaPack.create({
    data: {
      subscriptionId,
      grantedAt: input.grantedAt,
      quantity: input.quantity,
      expiresAt: input.expiresAt,
      source: "MANUAL",
    },
  });
}

/** 编辑手动包（仅所有者；AUTO 行不可手改——随生成器对账重排） */
export async function updatePack(
  actorId: string,
  packId: string,
  input: { grantedAt?: Date; quantity?: number; expiresAt?: Date },
): Promise<void> {
  await prisma.quotaPack.updateMany({
    where: { id: packId, source: "MANUAL", subscription: { ownerId: actorId } },
    data: {
      ...(input.grantedAt !== undefined && { grantedAt: input.grantedAt }),
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
    },
  });
}

/** 删除手动包（仅所有者；AUTO 行不可手删） */
export async function deletePack(actorId: string, packId: string): Promise<void> {
  await prisma.quotaPack.deleteMany({
    where: { id: packId, source: "MANUAL", subscription: { ownerId: actorId } },
  });
}

// ===== AUTO 包生成器（ADR-0012 读时对齐）：推演/展示前对账，未来包不物化 =====

/** 生成前提：周期模式 + QUOTA + STACKED + 下发量/有效期齐全；否则生成器无操作（手动模式/缺配置跳过） */
function autoPackConfig(sub: Subscription): { cycle: CycleSpec; quantity: number; validMonths: number } | null {
  if (sub.trackingMode !== "CYCLE") return null;
  if (sub.usageKind !== "QUOTA" || sub.grantMode !== "STACKED") return null;
  const cycle = toEngineSub(sub).cycle;
  const quantity = sub.quotaTotal;
  const validMonths = sub.packValidMonths;
  if (!cycle || quantity == null || quantity <= 0 || validMonths == null || validMonths <= 0) return null;
  return { cycle, quantity, validMonths };
}

/** 应有发放计划（无界序列，按日归一）：首笔付费前从起始日按周期推进（截断到首笔起期）；
 *  各付费区间内从区间起期按周期推进；末笔之后从最后止期链式推进——锚点改写（ADR-0001）自然生效。
 *  与成本段同一份周期推进逻辑（advanceCycle），日历月/年锚定原始日。 */
function* grantSchedule(
  sub: SubscriptionDef,
  payments: PaymentRec[],
  cycle: CycleSpec,
): Generator<Date> {
  const sorted = payments.slice().sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  // 每段链从其基点以 advanceCycle(base, cycle, n) 推进——月/年锚定原始日（1/31 → 2/28 → 3/31）
  const walk = function* (base: Date, endExclusive: Date | null): Generator<Date> {
    const b = dayStart(base);
    for (let n = 0; ; n++) {
      const g = n === 0 ? b : advanceCycle(b, cycle, n);
      if (endExclusive && dayDiff(g, endExclusive) <= 0) return;
      yield g;
    }
  };
  if (sorted.length === 0) {
    yield* walk(sub.startDate, null);
    return;
  }
  yield* walk(sub.startDate, dayStart(sorted[0].periodStart));
  for (const p of sorted) {
    yield* walk(p.periodStart, dayStart(p.periodEnd));
  }
  yield* walk(sorted[sorted.length - 1].periodEnd, null);
}

/** 读时对账：推导「订阅开始 → today」应有 AUTO 包并与库中对账——缺的补；
 *  存活但对不上计划（锚点改写/配置变更）的删了按新计划重生成；已到期（expiresAt ≤ today）的包不动
 * （历史已被快照校准）；MANUAL 行永不触碰。幂等：对账后重复触发无变更。 */
export async function reconcileAutoPacks(subscriptionId: string, today: Date): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { payments: true },
  });
  if (!sub) return;
  const cfg = autoPackConfig(sub);
  if (!cfg) return;
  const t = dayStart(today);
  // 应有包：发放日 ≤ today（未来包不物化）；expiresAt = 下发日 + packValidMonths 日历月（原始值，停订截断在推演时）
  const expected = new Map<number, { grantedAt: Date; quantity: number; expiresAt: Date }>();
  const validCycle: CycleSpec = { kind: "calendar", unit: "month", count: cfg.validMonths };
  for (const g of grantSchedule(toEngineSub(sub), toEnginePayments(sub.payments), cfg.cycle)) {
    if (dayDiff(t, g) > 0) break;
    const grantedAt = dayStart(g);
    expected.set(grantedAt.getTime(), {
      grantedAt,
      quantity: cfg.quantity,
      expiresAt: advanceCycle(grantedAt, validCycle, 1),
    });
  }
  const autos = await prisma.quotaPack.findMany({ where: { subscriptionId, source: "AUTO" } });
  const stale = autos.filter((p) => {
    if (dayDiff(t, p.expiresAt) <= 0) return false; // 已到期（含今天到期，排他约定）→ 不动
    const exp = expected.get(dayStart(p.grantedAt).getTime());
    return !exp || exp.quantity !== p.quantity || exp.expiresAt.getTime() !== dayStart(p.expiresAt).getTime();
  });
  const keptDays = new Set(
    autos.filter((p) => !stale.includes(p)).map((p) => dayStart(p.grantedAt).getTime()),
  );
  const toCreate = [...expected.values()].filter((e) => !keptDays.has(e.grantedAt.getTime()));
  if (stale.length === 0 && toCreate.length === 0) return;
  await prisma.$transaction([
    ...(stale.length > 0
      ? [prisma.quotaPack.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } })]
      : []),
    ...(toCreate.length > 0
      ? [
          prisma.quotaPack.createMany({
            data: toCreate.map((e) => ({ subscriptionId, ...e, source: "AUTO" })),
          }),
        ]
      : []),
  ]);
}

/** 「下期将下发」临时推导（未来包不物化，仅展示用）：第一个 > today 的计划发放日 */
export function nextAutoGrant(
  sub: SubscriptionWithPayments,
  today: Date,
): { date: Date; quantity: number } | null {
  const cfg = autoPackConfig(sub);
  if (!cfg) return null;
  const t = dayStart(today);
  for (const g of grantSchedule(toEngineSub(sub), toEnginePayments(sub.payments), cfg.cycle)) {
    if (dayDiff(t, g) > 0) return { date: dayStart(g), quantity: cfg.quantity };
  }
  return null;
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

/** 用量窗口周期（ADR-0013）：显式 usageCycle 优先；否则 QUOTA 回退计费周期；COUNT·SAVINGS 无显式周期则回退成本段 */
function usageCycleOf(sub: Subscription): { cycle: CycleSpec; anchor: Date } | null {
  if (sub.usageCycleUnit && sub.usageCycleCount) {
    return {
      cycle: {
        kind: "calendar",
        unit: sub.usageCycleUnit.toLowerCase() as "day" | "week" | "month" | "year",
        count: sub.usageCycleCount,
      },
      anchor: sub.usageCycleAnchor ?? sub.anchorDate ?? sub.startDate,
    };
  }
  if (sub.usageKind === "QUOTA") {
    const cycle = toEngineSub(sub).cycle;
    if (!cycle) return null;
    return { cycle, anchor: sub.anchorDate ?? sub.startDate };
  }
  return null;
}

/** 当前周期窗口（ADR-0013）：显式 usageCycle 优先；否则 QUOTA 回退计费周期；COUNT·SAVINGS 无显式周期则回退成本段。
 *  返回 { start, end, net, unknown }；无覆盖段为 null。 */
export function currentVerdictPeriod(
  sub: SubscriptionWithPayments,
  today: Date,
): { start: Date; end: Date; net: number; unknown: boolean } | null {
  const engineSub = toEngineSub(sub);
  const payments = toEnginePayments(sub.payments);
  const segs = costSegments(engineSub, payments, today);
  const usageCycle = usageCycleOf(sub);
  if (usageCycle) {
    const cur = currentUsagePeriod(usageCycle.cycle, usageCycle.anchor, today);
    if (!cur) return null;
    const pc = periodCost(segs, cur.start, cur.end);
    if (!pc.covered) return null;
    return { start: cur.start, end: cur.end, net: pc.net, unknown: pc.amountUnknown };
  }
  const covering = segs.find((s) => coversDate(s, today));
  if (!covering) return null;
  return {
    start: covering.start,
    end: covering.end,
    net: covering.net,
    unknown: covering.amountUnknown === true,
  };
}

/** 周期序列（历史回看导航）：显式 usageCycle → 截至覆盖 today 的周期窗口序列；
 *  否则（COUNT·SAVINGS 无显式周期 / 无计费周期可回退）→ 成本段序列。 */
export function usagePeriodsOf(
  sub: SubscriptionWithPayments,
  today: Date,
): { start: Date; end: Date }[] {
  const usageCycle = usageCycleOf(sub);
  if (usageCycle) {
    return [...usagePeriods(usageCycle.cycle, usageCycle.anchor, today)];
  }
  return costSegments(toEngineSub(sub), toEnginePayments(sub.payments), today).map((s) => ({
    start: s.start,
    end: s.end,
  }));
}

/** 薄分发器（ADR-0013 D1/D3）：QUOTA+STACKED → 账本 FEFO；QUOTA(RESET) → 闭式解；COUNT·SAVINGS → 事件流。
 *  period 缺省时按当前周期窗口装配；传入显式 period 时按该窗口装配（历史回看），净额按与成本段相交日费率分摊。
 *  传 forUserId 时按该受益人切片：成本 × 份额，用量只计其本人记录（STACKED 池级例外） */
function dispatchVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[]; quotaPacks?: QuotaPack[] },
  records: UsageRecord[],
  today: Date,
  forUserId: string | undefined,
  period?: { start: Date; end: Date },
): UsageVerdict | null {
  if (!sub.usageKind) return null;
  // 包叠加：浪费导向 PackVerdict（ADR-0012），自行处理区间归因（含已到期回落）
  if (sub.usageKind === "QUOTA" && sub.grantMode === "STACKED") {
    return packVerdict(sub, records, today, forUserId, period);
  }
  let p: { start: Date; end: Date; net: number; unknown: boolean } | null;
  if (period) {
    const pc = periodCost(
      costSegments(toEngineSub(sub), toEnginePayments(sub.payments), today),
      period.start,
      period.end,
    );
    p = { start: period.start, end: period.end, net: pc.net, unknown: pc.amountUnknown };
  } else {
    p = currentVerdictPeriod(sub, today);
  }
  if (!p) return null;
  if (sub.usageKind === "QUOTA") return resetVerdict(sub, records, forUserId, p);
  return streamVerdict(sub, records, forUserId, p);
}

/** 当前服务区间的盈亏（覆盖 today 的成本段；无覆盖为 null——STACKED 例外：
 *  已到期订阅回落到最后一段归因，停订浪费才能显形）。= 当前周期窗口 + 分发。
 *  传 forUserId 时按该受益人切片：成本 × 份额，用量只计其本人记录（STACKED 池级例外） */
export function getUsageVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[]; quotaPacks?: QuotaPack[] },
  records: UsageRecord[],
  today: Date,
  forUserId?: string,
): UsageVerdict | null {
  return dispatchVerdict(sub, records, today, forUserId);
}

/** 历史窗口盈亏：按显式 period 装配（RESET/COUNT/SAVINGS 净额按与成本段相交分摊；
 *  STACKED 以 period 覆盖归因，today 仅用于到期合成快照）。period 由 usagePeriodsOf 提供。 */
export function getUsageVerdictForPeriod(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[]; quotaPacks?: QuotaPack[] },
  records: UsageRecord[],
  period: { start: Date; end: Date },
  forUserId?: string,
): UsageVerdict | null {
  return dispatchVerdict(sub, records, today(), forUserId, period);
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
  const sub = await prisma.subscription.findFirst({ where: { id: rec.subscriptionId } });
  if (!sub) throw new Error("记录不存在 usage_not_found");
  if ((sub.usageKind === "COUNT" || sub.usageKind === "SAVINGS") && input.quotaTotal !== undefined) {
    throw new Error("计数/省钱记录不可改总额度 quota_total_not_allowed");
  }
  if (sub.usageKind === "QUOTA" && input.unitPrice !== undefined) {
    throw new Error("额度快照的单价无意义 unit_price_not_allowed");
  }
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
