"use client";

import { useState } from "react";
import { isoDay, wallDow, wallParts } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { Led, inputCls, labelCls } from "@/components/te";
import {
  addQuotaSnapshotAction,
  addSavingsAction,
  addUsageAction,
  deleteUsageAction,
} from "@/lib/usage/actions";


export interface UsageRecordRow {
  id: string;
  date: string;
  quantity: number;
  kind: string;
  unitPrice: number | null;
  quotaTotal: number | null;
  /** TOTAL 快照语义：USED=已用量 | REMAINING=剩余量；DELTA 为空 */
  semantic: string | null;
}

/** 序列化后的盈亏联合（详情页 server 端构造） */
export type VerdictData =
  | {
      kind: "COUNT";
      periodStart: string;
      periodEnd: string;
      cost: number;
      usage: number;
      value: number;
      verdictAmount: number;
      costPerUse: number | null;
      costUnknown?: boolean;
    }
  | {
      kind: "QUOTA";
      periodStart: string;
      periodEnd: string;
      cost: number;
      used: number;
      total: number;
      usageRate: number;
      /** 超额使用率（0–1，超出 100% 的部分）；0/缺省 = 未超额 */
      overageRate?: number;
      hit100At: string | null;
      wastedAmount: number;
      costPerUnit: number | null;
      verdictAmount: number;
      costUnknown?: boolean;
    }
  | {
      kind: "SAVINGS";
      periodStart: string;
      periodEnd: string;
      cost: number;
      saved: number;
      verdictAmount: number;
      costUnknown?: boolean;
    }
  | {
      kind: "PACK";
      periodStart: string;
      periodEnd: string;
      cost: number;
      balance: number;
      balanceAt: string | null;
      staleDays: number | null;
      nextExpiry: { date: string; quantity: number; projectedBalance: number } | null;
      periodWaste: { quantity: number; amount: number };
      totalWaste: { quantity: number; amount: number };
      wasteEvents: { date: string; quantity: number; amount: number }[];
      consumptionInferred: number;
      verdictAmount: number;
      costUnknown?: boolean;
    };

/** 用量录入卡：类型/单位可就地设定；本次用量、本次单价、当月总额度逐条可调，默认继承上一条记录 */
export function UsageEntryPanel({
  subscriptionId,
  usageKind,
  usageUnit,
  defaultUnitPrice,
  defaultQuotaTotal,
  records,
  verdict,
  currency,
}: {
  subscriptionId: string;
  usageKind: "COUNT" | "QUOTA" | "SAVINGS" | null;
  usageUnit: string | null;
  defaultUnitPrice: number | null;
  defaultQuotaTotal: number | null;
  records: UsageRecordRow[];
  verdict: VerdictData | null;
  currency: string;
}) {
  const today = isoDay(new Date());
  const last = records[records.length - 1];
  const kind: "COUNT" | "QUOTA" | "SAVINGS" = usageKind ?? "COUNT";
  // 从历史提取去重的 用量×单价 元组（最近优先）
  const tuples: { quantity: number; unitPrice: number | null }[] = [];
  for (const r of [...records].reverse()) {
    if (!tuples.some((t) => t.quantity === r.quantity && t.unitPrice === r.unitPrice)) {
      tuples.push({ quantity: r.quantity, unitPrice: r.unitPrice });
    }
  }
  const [quantity, setQuantity] = useState<string>(last?.quantity.toString() ?? "1");
  const [unitPrice, setUnitPrice] = useState<string>(last?.unitPrice?.toString() ?? "");
  const pricePlaceholder =
    last?.unitPrice ?? defaultUnitPrice ?? undefined;

  // 额度型：总额度继承上一条；三姿势（剩余/已用/百分比）直接录入，语义随记录落库（ADR-0013）
  const lastTotal = last?.quotaTotal ?? defaultQuotaTotal ?? 0;
  const lastUsed = last?.kind === "TOTAL" ? last.quantity : 0;
  const [qTotal, setQTotal] = useState<number>(lastTotal);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // 回本提示：计数型按参考单价还差多少用量回本；额度型看距用满还差多少
  const refPrice = last?.unitPrice ?? defaultUnitPrice;
  const needed =
    verdict?.kind === "COUNT" && !verdict.costUnknown && refPrice && refPrice > 0
      ? Math.max(0, Math.ceil((verdict.cost - verdict.value) / refPrice))
      : null;
  const quotaHint =
    verdict?.kind === "QUOTA"
      ? verdict.usageRate >= 1
        ? { done: true as const }
        : { done: false as const, remainingPct: r2((1 - verdict.usageRate) * 100) }
      : null;
  // 省钱型：本区间已记已省（累计录入的求差基准，无覆盖区间时为全部记录）与回本差额
  const savingsBaseline =
    r2(
      records
        .filter((r) => !verdict || (r.date >= verdict.periodStart && r.date < verdict.periodEnd))
        .reduce((s, r) => s + r.quantity, 0),
    );
  const savingsHint =
    verdict?.kind === "SAVINGS" && !verdict.costUnknown
      ? verdict.cost - verdict.saved > 0
        ? { done: false as const, remaining: r2(verdict.cost - verdict.saved) }
        : { done: true as const, net: r2(verdict.saved - verdict.cost) }
      : null;
  // 日历数据：从区间首日所在周的周一开始，到区间末日止
  const calDays: { day: number; inPeriod: boolean; used: boolean; today: boolean }[] = [];
  if (verdict) {
    const start = new Date(`${verdict.periodStart}T00:00:00+08:00`).getTime();
    const end = new Date(`${verdict.periodEnd}T00:00:00+08:00`).getTime();
    const todayMs = new Date(`${today}T00:00:00+08:00`).getTime();
    const usedDates = new Set(records.map((r) => r.date));
    // 对齐周一（北京墙钟，0=周日）
    const startDow = (wallDow(new Date(start)) + 6) % 7;
    const calStart = start - startDow * 86_400_000;
    for (let t = calStart; t < end; t += 86_400_000) {
      const iso = isoDay(new Date(t));
      calDays.push({
        day: wallParts(new Date(t)).day,
        inPeriod: t >= start,
        used: usedDates.has(iso),
        today: t === todayMs,
      });
    }
  }

  return (
    <div className="px-4 py-4">
      {kind === "SAVINGS" ? (
        <form key="savings" action={addSavingsAction.bind(null, subscriptionId)} className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>日期</label>
              <input name="date" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
            </div>
            <div className="w-28">
              <label className={labelCls}>本次已省</label>
              <input name="amount" type="number" step="0.01" min="0.01" placeholder="6.00" className={inputCls} />
            </div>
            <div className="w-32">
              <label className={labelCls}>或平台累计已省</label>
              <input
                name="cumulative"
                type="number"
                step="0.01"
                min="0"
                placeholder={savingsBaseline > 0 ? `${savingsBaseline}` : "342.00"}
                className={inputCls}
              />
            </div>
            <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
              记一笔 →
            </button>
          </div>
          <div className="text-[9px] uppercase text-faint f-mono">
            二选一：直接记本次省了多少；或照抄平台「当期已省」，自动与本区间已记（{fmtMoney(savingsBaseline, currency)}）求差
          </div>
        </form>
      ) : kind === "COUNT" ? (
        <form key="count" action={addUsageAction.bind(null, subscriptionId)} className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>日期</label>
              <input name="date" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
            </div>
            <div className="w-20">
              <label className={labelCls}>本次用量</label>
              <input name="quantity" type="number" step="any" min="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className={inputCls} />
            </div>
            <div className="w-24">
              <label className={labelCls}>本次单价</label>
              <input
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder={pricePlaceholder?.toString() ?? "30"}
                className={inputCls}
              />
            </div>
            <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
              记一次 →
            </button>
          </div>
          {tuples.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tuples.slice(0, 6).map((t) => (
                <button
                  key={`${t.quantity}@${t.unitPrice ?? "def"}`}
                  type="button"
                  onClick={() => {
                    setQuantity(t.quantity.toString());
                    setUnitPrice(t.unitPrice?.toString() ?? "");
                  }}
                  className="border border-ink bg-surface px-2 py-1 text-[10px] f-mono hover:bg-ink hover:text-surface"
                >
                  {t.quantity} {usageUnit ?? "次"}{t.unitPrice != null ? ` @ ${t.unitPrice}` : ""}
                </button>
              ))}
            </div>
          )}
          <div className="text-[9px] uppercase text-faint f-mono">
            单价留空继承上一条记录{pricePlaceholder != null ? `（${pricePlaceholder}）` : "或订阅默认"}
          </div>
        </form>
      ) : (
        <form key="quota" action={addQuotaSnapshotAction.bind(null, subscriptionId)} className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>日期</label>
              <input name="date" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
            </div>
            <div className="w-28">
              <label className={labelCls}>总额度{usageUnit ? `（${usageUnit}）` : ""}</label>
              <input
                name="quotaTotal"
                type="number"
                step="any"
                min="1"
                value={qTotal || ""}
                onChange={(e) => setQTotal(parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
              记录 →
            </button>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className={labelCls}>剩余总量</label>
              <input
                name="remaining"
                type="number"
                step="any"
                min="0"
                placeholder={last?.kind === "TOTAL" ? `${last.quantity}` : "45"}
                className={`${inputCls} w-24`}
              />
            </div>
            <div>
              <label className={labelCls}>已用量</label>
              <input
                name="used"
                type="number"
                step="any"
                min="0"
                placeholder={lastUsed ? `${lastUsed}` : "650"}
                className={`${inputCls} w-24`}
              />
            </div>
            <div>
              <label className={labelCls}>使用 %</label>
              <input
                name="percent"
                type="number"
                step="any"
                min="0"
                placeholder="80"
                className={`${inputCls} w-20`}
              />
            </div>
          </div>
          <div className="text-[9px] uppercase text-faint f-mono">
            三选一填一个：剩余总量 / 已用量 / 使用百分比，语义随记录落库（ADR-0013）
            {last?.kind === "TOTAL" &&
              ` · 上一条：${last.date} ${last.semantic === "REMAINING" ? "剩余" : "已用"} ${last.quantity} ${usageUnit ?? ""}`}
          </div>
        </form>
      )}

      {verdict && (
        <div className="mt-3 border-t border-dashed border-line-strong pt-3">
          {needed !== null && (
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <Led color={needed === 0 ? "#22c55e" : "var(--accent)"} />
              {needed === 0 ? (
                <span>已回本，多用都是赚</span>
              ) : (
                <span>
                  再去 <strong className="tabular-nums">{needed}</strong> {usageUnit ?? "次"}回本
                  <span className="text-faint">（按 {refPrice}/{usageUnit ?? "次"}）</span>
                </span>
              )}
            </div>
          )}
          {quotaHint && (
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <Led color={quotaHint.done ? "#22c55e" : "var(--accent)"} />
              {quotaHint.done ? (
                <span>本区间已用满 100%</span>
              ) : (
                <span>
                  还差 <strong className="tabular-nums">{quotaHint.remainingPct}%</strong> 用满
                </span>
              )}
            </div>
          )}
          {savingsHint && (
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <Led color={savingsHint.done ? "#22c55e" : "var(--accent)"} />
              {savingsHint.done ? (
                <span>
                  已回本，净省 <strong className="tabular-nums">{fmtMoney(savingsHint.net, currency)}</strong>
                </span>
              ) : (
                <span>
                  再省 <strong className="tabular-nums">{fmtMoney(savingsHint.remaining, currency)}</strong> 回本
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-7 gap-1">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div key={w} className="text-center text-[9px] uppercase text-faint f-mono">
                {w}
              </div>
            ))}
            {calDays.map((d, i) => (
              <div
                key={i}
                className={`flex flex-col items-center py-1 text-[10px] f-mono ${
                  d.today ? "border border-ink bg-base font-bold" : "border border-transparent"
                } ${d.inPeriod ? "" : "text-line-strong"}`}
              >
                <span>{d.day}</span>
                <span
                  className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: d.used ? "var(--accent)" : "transparent" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] uppercase text-faint f-mono">
            <span>{verdict.periodStart}</span>
            <span>点 = 有用量 · 框 = 今天</span>
            <span>{verdict.periodEnd}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 盈亏网格共用单元：已摊成本 */
function CostCell({ v, currency }: { v: VerdictData; currency: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase text-faint f-mono">已摊成本</div>
      <div className="text-lg font-bold tabular-nums">{fmtMoney(v.cost, currency)}</div>
    </div>
  );
}

/** 盈亏网格共用单元：盈亏行（含成本未知降级） */
function PnlCell({
  v,
  currency,
}: {
  v: VerdictData & { verdictAmount: number; costUnknown?: boolean };
  currency: string;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase text-faint f-mono">盈亏</div>
      {v.costUnknown ? (
        <div className="text-lg font-bold text-faint">未知</div>
      ) : (
        <div className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${v.verdictAmount >= 0 ? "text-income" : "text-destructive"}`}>
          {v.verdictAmount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(v.verdictAmount), currency)}
          <Led color={v.verdictAmount >= 0 ? "#22c55e" : "#ef4444"} />
        </div>
      )}
      {v.costUnknown && (
        <div className="text-[9px] text-faint f-mono">成本未记录，盈亏不可信</div>
      )}
    </div>
  );
}

/** 流式引擎（COUNT/SAVINGS）盈亏网格：已摊成本 + 计数/省钱口径 */
function StreamVerdict({
  v,
  usageUnit,
  currency,
}: {
  v: Extract<VerdictData, { kind: "COUNT" | "SAVINGS" }>;
  usageUnit: string | null;
  currency: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CostCell v={v} currency={currency} />
      {v.kind === "COUNT" ? (
        <>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">用量</div>
            <div className="text-lg font-bold tabular-nums">
              {v.usage} <span className="text-[10px] text-faint">{usageUnit}</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">每次实际成本</div>
            <div className="text-lg font-bold tabular-nums">
              {v.costPerUse != null ? fmtMoney(v.costPerUse, currency) : "—"}
            </div>
          </div>
          <PnlCell v={v} currency={currency} />
        </>
      ) : (
        <>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">已省金额</div>
            <div className="text-lg font-bold tabular-nums">{fmtMoney(v.saved, currency)}</div>
          </div>
          <PnlCell v={v} currency={currency} />
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">回本差额</div>
            <div className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${v.verdictAmount >= 0 ? "text-income" : ""}`}>
              {v.verdictAmount >= 0 ? (
                <>
                  已净省 {fmtMoney(v.saved - v.cost, currency)}
                  <Led color="#22c55e" />
                </>
              ) : (
                <>
                  还差 {fmtMoney(v.cost - v.saved, currency)}
                  <Led color="var(--accent)" />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 账本引擎（QUOTA/PACK）盈亏网格：已摊成本 + 额度/包口径 */
function LedgerVerdict({
  v,
  usageUnit,
  currency,
}: {
  v: Extract<VerdictData, { kind: "QUOTA" | "PACK" }>;
  usageUnit: string | null;
  currency: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CostCell v={v} currency={currency} />
      {v.kind === "PACK" ? (
        <>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">余额（最新快照）</div>
            <div className="text-lg font-bold tabular-nums">
              {v.balanceAt ? (
                <>
                  {v.balance} <span className="text-[10px] text-faint">{usageUnit}</span>
                </>
              ) : (
                <span className="text-sm text-faint">未录入快照</span>
              )}
            </div>
            {v.balanceAt && (
              <div className={`text-[9px] f-mono ${v.staleDays != null && v.staleDays >= 30 ? "font-bold text-destructive" : "text-faint"}`}>
                快照 {v.balanceAt}
                {v.staleDays != null && v.staleDays > 0 && ` · 陈旧 ${v.staleDays} 天`}
                {v.staleDays != null && v.staleDays >= 30 && "，该校准了"}
              </div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">到期预警</div>
            {v.nextExpiry ? (
              <>
                <div className="text-sm font-bold tabular-nums">
                  {v.nextExpiry.date}
                  <span className="ml-1 text-[10px] font-normal text-faint">
                    {v.nextExpiry.quantity} {usageUnit} 到期
                  </span>
                </div>
                <div className="text-[9px] text-faint f-mono">
                  按当前消耗预计剩 {v.nextExpiry.projectedBalance} {usageUnit}
                </div>
              </>
            ) : (
              <div className="text-sm text-faint">无存活包</div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">本区间浪费</div>
            <div className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${v.periodWaste.amount <= 0 ? "text-income" : "text-destructive"}`}>
              {v.periodWaste.amount <= 0 ? fmtMoney(0, currency) : `−${fmtMoney(v.periodWaste.amount, currency)}`}
              <Led color={v.periodWaste.amount <= 0 ? "#22c55e" : "#ef4444"} />
            </div>
            <div className="text-[9px] text-faint f-mono">{v.periodWaste.quantity} {usageUnit} 到期未用</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">累计浪费</div>
            <div className={`text-lg font-bold tabular-nums ${v.totalWaste.amount <= 0 ? "" : "text-destructive"}`}>
              {v.totalWaste.amount <= 0 ? fmtMoney(0, currency) : `−${fmtMoney(v.totalWaste.amount, currency)}`}
            </div>
            <div className="text-[9px] text-faint f-mono">
              推算已消费 {v.consumptionInferred} {usageUnit}
            </div>
          </div>
          {v.wasteEvents.length > 0 && (
            <div className="sm:col-span-2">
              <div className="text-[9px] uppercase text-faint f-mono">浪费明细（已确认，跨区间可回看）</div>
              <div className="mt-1 space-y-0.5">
                {v.wasteEvents.map((w) => (
                  <div key={w.date} className="flex justify-between text-[10px] tabular-nums f-mono">
                    <span>{w.date}</span>
                    <span>
                      {w.quantity} {usageUnit}
                      {w.amount > 0 ? ` · −${fmtMoney(w.amount, currency)}` : " · 赠送包"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">使用率</div>
            <div className="text-lg font-bold tabular-nums">
              {Math.round(v.usageRate * 10000) / 100}%
              {v.overageRate != null && v.overageRate > 0 && (
                <span className="ml-1 rounded bg-destructive-band px-1.5 py-0.5 align-middle text-[10px] font-semibold text-destructive-strong f-mono">
                  超额 {Math.round(v.overageRate * 100)}%
                </span>
              )}
              <span className="ml-1 text-[10px] font-normal text-faint">
                {v.used}/{v.total} {usageUnit}
              </span>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">用满 100%</div>
            <div className="flex items-center gap-1.5 text-lg font-bold tabular-nums">
              {v.hit100At ? (
                <>
                  <span className="text-sm">{v.hit100At}</span>
                  <Led color="#22c55e" />
                </>
              ) : (
                <>
                  <span className="text-sm text-faint">未用满</span>
                  <Led color="#ef4444" />
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-faint f-mono">浪费</div>
            <div className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${v.wastedAmount <= 0 ? "text-income" : "text-destructive"}`}>
              {v.wastedAmount <= 0 ? fmtMoney(0, currency) : `−${fmtMoney(v.wastedAmount, currency)}`}
              <Led color={v.wastedAmount <= 0 ? "#22c55e" : "#ef4444"} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 盈亏呈现卡：周期导航 + 流式/账本两套引擎渲染 + 历史回看 */
export function UsageVerdictPanel({
  verdicts,
  currentIndex,
  noEntry = false,
  usageUnit,
  subscriptionId,
  records,
  perUser = [],
  currency,
}: {
  verdicts: { start: string; end: string; verdict: VerdictData | null }[];
  currentIndex: number;
  /** RESET 额度型：当前周期存在但无快照（未录入，区别于无覆盖区间） */
  noEntry?: boolean;
  usageUnit: string | null;
  subscriptionId: string;
  records: UsageRecordRow[];
  /** 所有者视角：各受益人用量与盈亏对比 */
  perUser?: { name: string; usageLabel: string; verdictAmount: number }[];
  currency: string;
}) {
  const last = Math.max(0, verdicts.length - 1);
  const [idx, setIdx] = useState(Math.max(0, Math.min(currentIndex, last)));
  const v = verdicts[idx]?.verdict ?? null;
  const navBtn =
    "flex h-6 w-6 items-center justify-center border border-ink bg-surface text-[12px] leading-none f-mono hover:bg-ink hover:text-surface disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="px-4 py-4">
      {verdicts.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="上一周期"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx <= 0}
            className={navBtn}
          >
            ‹
          </button>
          <div className="flex items-center gap-2 text-[10px] uppercase f-mono text-muted">
            <span className="tabular-nums">
              {verdicts[idx] ? `${verdicts[idx].start} ~ ${verdicts[idx].end}` : "—"}
            </span>
            {idx !== currentIndex && (
              <button
                type="button"
                onClick={() => setIdx(currentIndex)}
                className="border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase tracking-wider hover:bg-ink hover:text-surface"
              >
                回到当前
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="下一周期"
            onClick={() => setIdx((i) => Math.min(last, i + 1))}
            disabled={idx >= last}
            className={navBtn}
          >
            ›
          </button>
        </div>
      )}
      {noEntry && idx === currentIndex ? (
        <div className="py-6 text-center text-[11px] uppercase text-faint f-mono">
          本周期未录入用量快照
        </div>
      ) : !v ? (
        <div className="py-6 text-center text-[11px] uppercase text-faint f-mono">
          当前无覆盖的服务区间
        </div>
      ) : (
        <>
          {v.kind === "COUNT" || v.kind === "SAVINGS" ? (
            <StreamVerdict v={v} usageUnit={usageUnit} currency={currency} />
          ) : (
            <LedgerVerdict v={v} usageUnit={usageUnit} currency={currency} />
          )}
          <div className="mt-3 border-t border-dashed border-line-strong pt-1.5 text-[9px] uppercase text-faint f-mono">
            {v.periodStart} → {v.periodEnd} ·{" "}
            {v.kind === "COUNT"
              ? `价值 ${fmtMoney(v.value, currency)} − 成本 ${fmtMoney(v.cost, currency)}`
              : v.kind === "SAVINGS"
                ? `已省 ${fmtMoney(v.saved, currency)} − 成本 ${fmtMoney(v.cost, currency)}`
                : v.kind === "PACK"
                  ? `区间浪费 −${fmtMoney(v.periodWaste.amount, currency)} · 累计 −${fmtMoney(v.totalWaste.amount, currency)}`
                  : `未用 ${Math.round((1 - v.usageRate) * 10000) / 100}% × 成本 ${fmtMoney(v.cost, currency)}`}
          </div>
          {perUser.length > 0 && (
            <div className="mt-2 border-t border-dashed border-line-strong pt-2">
              <div className="mb-1 text-[9px] uppercase text-faint f-mono">各受益人</div>
              {perUser.map((u) => (
                <div key={u.name} className="flex items-center justify-between py-1 text-[11px] f-mono">
                  <span>{u.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted">{u.usageLabel}</span>
                    <span className={u.verdictAmount >= 0 ? "text-income" : "text-destructive"}>
                      {u.verdictAmount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(u.verdictAmount), currency)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {records.length > 0 && (
            <div className="mt-2 border-t border-dashed border-line-strong pt-2">
              {[...records].reverse().slice(0, 10).map((r) => (
                <div key={r.id} className="group flex items-center justify-between py-1 text-[11px] f-mono">
                  <span className="text-muted">{r.date}</span>
                  <span className="flex items-center gap-2">
                    {v.kind === "SAVINGS"
                      ? `+${fmtMoney(r.quantity, currency)}`
                      : v.kind === "PACK" || (r.kind === "TOTAL" && r.semantic === "REMAINING")
                        ? `剩余 ${r.quantity} ${usageUnit ?? ""}`
                        : `${r.kind === "TOTAL" ? `已用 ${r.quantity}` : `+${r.quantity}`} ${usageUnit ?? ""}`}
                    {r.unitPrice != null && <span className="text-faint">@ {r.unitPrice}</span>}
                    <button
                      onClick={async () => deleteUsageAction(subscriptionId, r.id)}
                      className="invisible text-destructive group-hover:visible"
                    >
                      ×
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

