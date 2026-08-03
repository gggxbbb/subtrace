// 用量与盈亏（ticket 06）：计数型逐条 + 额度型快照，按当前服务区间算盈亏。

import { prisma } from "../db";
import {
  actualCostPerUse,
  advanceCycle,
  costSegments,
  coversDate,
  currentExpiry,
  dayDiff,
  savingsVerdict,
  usageInPeriod,
  usageValue,
  verdict,
  type CycleSpec,
  type PaymentRec,
  type SubscriptionDef,
} from "../cost-engine";
import {
  toEnginePayments,
  toEngineSub,
  type SubscriptionWithPayments,
} from "../subscriptions/service";
import type { Beneficiary, QuotaPack, Subscription, UsageRecord } from "@/generated/prisma/client";
import { shareForViewer } from "../beneficiaries/service";
import { projectPackLedger, type PackInput, type RemainingSnapshot } from "./pack-ledger";
import { dayStart } from "../dates";

export type UsageKind = "COUNT" | "QUOTA" | "SAVINGS";
/** 发放形态（ADR-0012）：空 = RESET | STACKED（包叠加）；仅 QUOTA 有意义 */
export type GrantMode = "RESET" | "STACKED";

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
  if (sub.usageKind === "QUOTA" && sub.grantMode === "STACKED") {
    throw new Error("包叠加形态只收剩余快照 stacked_no_delta");
  }
  return prisma.usageRecord.create({
    data: { subscriptionId, userId, date: input.date, quantity: input.quantity, unitPrice: input.unitPrice, kind: "DELTA" },
  });
}

/** 额度型：RESET 录已用量或百分比（百分比按当月总额度折算）；STACKED 只收剩余总量（ADR-0012 混录禁止） */
export async function addQuotaSnapshot(
  actorId: string,
  subscriptionId: string,
  userId: string,
  input: { date: Date; used?: number; percent?: number; remaining?: number; unitPrice?: number; quotaTotal?: number },
): Promise<UsageRecord> {
  const sub = await assertUsageAllowed(actorId, subscriptionId);
  if (sub.grantMode === "STACKED") {
    if (input.remaining == null || input.used != null || input.percent != null) {
      throw new Error("包叠加形态只收剩余总量 stacked_remaining_required");
    }
    return prisma.usageRecord.create({
      data: { subscriptionId, userId, date: input.date, quantity: input.remaining, kind: "TOTAL" },
    });
  }
  if (input.remaining != null) {
    throw new Error("周期重置形态录已用量/百分比，不收剩余 reset_used_required");
  }
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
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, ownerId: actorId } });
  if (!sub) throw new Error("订阅不存在 subscription_not_found");
  if (sub.usageKind !== "QUOTA" || sub.grantMode !== "STACKED") {
    throw new Error("非包叠加形态 not_stacked");
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

export type UsageVerdict = CountVerdict | QuotaVerdict | SavingsVerdict | PackVerdict;

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
  /** 累计推算消费（快照校准口径） */
  consumptionInferred: number;
  /** = −本区间确认浪费金额（≤0） */
  verdictAmount: number;
}

/** 包叠加 verdict 装配：剩余快照 + 包列表 + 订阅到期日 → FEFO 推演 → 浪费口径盈亏。
 *  订阅已到期（expiry < today）时合成一条到期日 remaining=0 的快照，使停订即焚无需用户操作即显形。 */
function packVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[]; quotaPacks?: QuotaPack[] },
  records: UsageRecord[],
  today: Date,
  forUserId: string | undefined,
): PackVerdict | null {
  const engineSub = toEngineSub(sub);
  const payments = toEnginePayments(sub.payments);
  const segments = costSegments(engineSub, payments, today);
  const covering = segments.find((s) => coversDate(s, today));
  // 已到期：无覆盖段时取最后一段为归因区间（停订浪费确认在到期日 = 段末排他端点，含端点归因）
  const terminal = !covering && segments.length > 0;
  const period = covering ?? (terminal ? segments[segments.length - 1] : null);
  if (!period) return null;
  const share = forUserId ? shareForViewer(sub.beneficiaries ?? [], sub.ownerId, forUserId) : 1;

  const packs: PackInput[] = (sub.quotaPacks ?? []).map((p) => ({
    grantedAt: p.grantedAt,
    quantity: p.quantity,
    expiresAt: p.expiresAt,
    source: p.source === "AUTO" ? "AUTO" : "MANUAL",
  }));
  // 池级快照（不按受益人切——共享池按人各记一遍即双倍计数）
  const snapshots: RemainingSnapshot[] = records
    .filter((r) => r.kind === "TOTAL")
    .map((r) => ({ date: r.date, remaining: r.quantity }));
  const expiry = currentExpiry(engineSub, payments, today);
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
      w.date >= period.start && (terminal ? w.date <= period.end : w.date < period.end),
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
    consumptionInferred: ledger.consumptionInferred,
    verdictAmount: -periodWaste.amount + 0, // 避免 -0
  };
}

/** 当前服务区间的盈亏（覆盖 today 的成本段；无覆盖为 null——STACKED 例外：
 *  已到期订阅回落到最后一段归因，停订浪费才能显形）。
 *  传 forUserId 时按该受益人切片：成本 × 份额，用量只计其本人记录（STACKED 池级例外） */
export function getUsageVerdict(
  sub: SubscriptionWithPayments & { beneficiaries?: Beneficiary[]; quotaPacks?: QuotaPack[] },
  records: UsageRecord[],
  today: Date,
  forUserId?: string,
): UsageVerdict | null {
  if (!sub.usageKind) return null;
  // 包叠加：浪费导向 PackVerdict（ADR-0012），自行处理区间归因（含已到期回落）
  if (sub.usageKind === "QUOTA" && sub.grantMode === "STACKED") {
    return packVerdict(sub, records, today, forUserId);
  }
  const covering = costSegments(toEngineSub(sub), toEnginePayments(sub.payments), today).find((s) =>
    coversDate(s, today),
  );
  if (!covering) return null;
  const share = forUserId ? shareForViewer(sub.beneficiaries ?? [], sub.ownerId, forUserId) : 1;
  const costShare = covering.net * share;
  const costUnknown = covering.amountUnknown === true;
  const myRecords = forUserId ? records.filter((r) => r.userId === forUserId) : records;

  if (sub.usageKind === "QUOTA") {
    // 额度型（周期重置）：只看使用率——用到 100% 没有，什么时候用满；浪费 = 未用部分 × 成本
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
