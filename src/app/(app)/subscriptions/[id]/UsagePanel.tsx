"use client";

import { useState } from "react";
import { isoDay, wallDow, wallParts } from "@/lib/dates";
import { Led } from "@/components/te";
import {
  addQuotaSnapshotAction,
  addUsageAction,
  deleteUsageAction,
} from "@/lib/usage/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export interface UsageRecordRow {
  id: string;
  date: string;
  quantity: number;
  kind: string;
  unitPrice: number | null;
  quotaTotal: number | null;
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
      hit100At: string | null;
      wastedAmount: number;
      costPerUnit: number | null;
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
}: {
  subscriptionId: string;
  usageKind: "COUNT" | "QUOTA" | null;
  usageUnit: string | null;
  defaultUnitPrice: number | null;
  defaultQuotaTotal: number | null;
  records: UsageRecordRow[];
  verdict: VerdictData | null;
}) {
  const today = isoDay(new Date());
  const last = records[records.length - 1];
  const kind: "COUNT" | "QUOTA" = usageKind ?? "COUNT";
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

  // 额度型：总额继承上一条；第二行四值联动（使用到额度 = 快照值，本次 = 与上一条的差）
  const lastTotal = last?.quotaTotal ?? defaultQuotaTotal ?? 0;
  const lastUsed = last?.kind === "TOTAL" ? last.quantity : 0;
  const [qTotal, setQTotal] = useState<number>(lastTotal);
  const [qUsedTo, setQUsedTo] = useState<number>(lastUsed);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const qDelta = r2(qUsedTo - lastUsed);
  const qUsedToPct = qTotal > 0 ? r1((qUsedTo / qTotal) * 100) : 0;
  const qDeltaPct = qTotal > 0 ? r1((qDelta / qTotal) * 100) : 0;

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
        : { done: false as const, remainingPct: Math.round((1 - verdict.usageRate) * 100) }
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
      {kind === "COUNT" ? (
        <form key="count" action={addUsageAction.bind(null, subscriptionId)} className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>日期</label>
              <input name="date" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
            </div>
            <div className="w-20">
              <label className={labelCls}>本次用量</label>
              <input name="quantity" type="number" step="0.5" min="0.5" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className={inputCls} />
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
            <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
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
                  className="border border-black bg-white px-2 py-1 text-[10px] f-mono hover:bg-black hover:text-white"
                >
                  {t.quantity} {usageUnit ?? "次"}{t.unitPrice != null ? ` @ ${t.unitPrice}` : ""}
                </button>
              ))}
            </div>
          )}
          <div className="text-[9px] uppercase text-neutral-400 f-mono">
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
              <label className={labelCls}>当月总额度</label>
              <input
                name="quotaTotal"
                type="number"
                step="1"
                min="1"
                value={qTotal || ""}
                onChange={(e) => setQTotal(parseFloat(e.target.value) || 0)}
                required
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className={labelCls}>本次额度</label>
              <input
                type="number"
                value={qDelta}
                onChange={(e) => setQUsedTo(r2(lastUsed + (parseFloat(e.target.value) || 0)))}
                className={`${inputCls} w-24`}
              />
            </div>
            <div>
              <label className={labelCls}>本次 %</label>
              <input
                type="number"
                step="0.1"
                value={qDeltaPct}
                onChange={(e) => setQUsedTo(r2(lastUsed + (qTotal * (parseFloat(e.target.value) || 0)) / 100))}
                className={`${inputCls} w-20`}
              />
            </div>
            <div>
              <label className={labelCls}>使用到额度</label>
              <input
                name="used"
                type="number"
                step="1"
                min="0"
                value={qUsedTo}
                onChange={(e) => setQUsedTo(parseFloat(e.target.value) || 0)}
                className={`${inputCls} w-24`}
              />
            </div>
            <div>
              <label className={labelCls}>使用到 %</label>
              <input
                type="number"
                step="0.1"
                value={qUsedToPct}
                onChange={(e) => setQUsedTo(r2((qTotal * (parseFloat(e.target.value) || 0)) / 100))}
                className={`${inputCls} w-20`}
              />
            </div>
            <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
              更新 →
            </button>
          </div>
          <div className="text-[9px] uppercase text-neutral-400 f-mono">
            提交的是「使用到额度」快照；四个数值联动，改任意一个其余自动算
          </div>
        </form>
      )}

      {verdict && (
        <div className="mt-3 border-t border-dashed border-neutral-300 pt-3">
          {needed !== null && (
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <Led color={needed === 0 ? "#22c55e" : "#FF5A00"} />
              {needed === 0 ? (
                <span>已回本，多用都是赚</span>
              ) : (
                <span>
                  再去 <strong className="tabular-nums">{needed}</strong> {usageUnit ?? "次"}回本
                  <span className="text-neutral-400">（按 {refPrice}/{usageUnit ?? "次"}）</span>
                </span>
              )}
            </div>
          )}
          {quotaHint && (
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <Led color={quotaHint.done ? "#22c55e" : "#FF5A00"} />
              {quotaHint.done ? (
                <span>本区间已用满 100%</span>
              ) : (
                <span>
                  还差 <strong className="tabular-nums">{quotaHint.remainingPct}%</strong> 用满
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-7 gap-1">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div key={w} className="text-center text-[9px] uppercase text-neutral-400 f-mono">
                {w}
              </div>
            ))}
            {calDays.map((d, i) => (
              <div
                key={i}
                className={`flex flex-col items-center py-1 text-[10px] f-mono ${
                  d.today ? "border border-black bg-[#E4E3E0] font-bold" : "border border-transparent"
                } ${d.inPeriod ? "" : "text-neutral-300"}`}
              >
                <span>{d.day}</span>
                <span
                  className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: d.used ? "#FF5A00" : "transparent" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] uppercase text-neutral-400 f-mono">
            <span>{verdict.periodStart}</span>
            <span>点 = 有用量 · 框 = 今天</span>
            <span>{verdict.periodEnd}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 盈亏呈现卡：计数型四指标 / 额度型使用率口径 + 历史记录 */
export function UsageVerdictPanel({
  verdict: v,
  usageUnit,
  subscriptionId,
  records,
  perUser = [],
}: {
  verdict: VerdictData | null;
  usageUnit: string | null;
  subscriptionId: string;
  records: UsageRecordRow[];
  /** 所有者视角：各受益人用量与盈亏对比 */
  perUser?: { name: string; usageLabel: string; verdictAmount: number }[];
}) {
  if (!v) {
    return (
      <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
        当前无覆盖的服务区间
      </div>
    );
  }
  const fmtMoney = (n: number) =>
    n.toLocaleString("zh-CN", { style: "currency", currency: "CNY" });
  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] uppercase text-neutral-400 f-mono">已摊成本</div>
          <div className="text-lg font-bold tabular-nums">{fmtMoney(v.cost)}</div>
        </div>
        {v.kind === "COUNT" ? (
          <>
            <div>
              <div className="text-[9px] uppercase text-neutral-400 f-mono">用量</div>
              <div className="text-lg font-bold tabular-nums">
                {v.usage} <span className="text-[10px] text-neutral-400">{usageUnit}</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-neutral-400 f-mono">每次实际成本</div>
              <div className="text-lg font-bold tabular-nums">
                {v.costPerUse != null ? fmtMoney(v.costPerUse) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-neutral-400 f-mono">盈亏</div>
              {v.costUnknown ? (
                <div className="text-lg font-bold text-neutral-400">未知</div>
              ) : (
                <div className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${v.verdictAmount >= 0 ? "text-teal-700" : "text-red-700"}`}>
                  {v.verdictAmount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(v.verdictAmount))}
                  <Led color={v.verdictAmount >= 0 ? "#22c55e" : "#ef4444"} />
                </div>
              )}
              {v.costUnknown && (
                <div className="text-[9px] text-neutral-400 f-mono">成本未记录，盈亏不可信</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-[9px] uppercase text-neutral-400 f-mono">使用率</div>
              <div className="text-lg font-bold tabular-nums">
                {Math.round(v.usageRate * 100)}%
                <span className="ml-1 text-[10px] font-normal text-neutral-400">
                  {v.used}/{v.total} {usageUnit}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-neutral-400 f-mono">用满 100%</div>
              <div className="flex items-center gap-1.5 text-lg font-bold tabular-nums">
                {v.hit100At ? (
                  <>
                    <span className="text-sm">{v.hit100At}</span>
                    <Led color="#22c55e" />
                  </>
                ) : (
                  <>
                    <span className="text-sm text-neutral-400">未用满</span>
                    <Led color="#ef4444" />
                  </>
                )}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-neutral-400 f-mono">浪费</div>
              <div className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${v.wastedAmount <= 0 ? "text-teal-700" : "text-red-700"}`}>
                {v.wastedAmount <= 0 ? "¥0" : `−${fmtMoney(v.wastedAmount)}`}
                <Led color={v.wastedAmount <= 0 ? "#22c55e" : "#ef4444"} />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="mt-3 border-t border-dashed border-neutral-300 pt-1.5 text-[9px] uppercase text-neutral-400 f-mono">
        {v.periodStart} → {v.periodEnd} ·{" "}
        {v.kind === "COUNT"
          ? `价值 ${fmtMoney(v.value)} − 成本 ${fmtMoney(v.cost)}`
          : `未用 ${Math.round((1 - v.usageRate) * 100)}% × 成本 ${fmtMoney(v.cost)}`}
      </div>
      {perUser.length > 0 && (
        <div className="mt-2 border-t border-dashed border-neutral-300 pt-2">
          <div className="mb-1 text-[9px] uppercase text-neutral-400 f-mono">各受益人</div>
          {perUser.map((u) => (
            <div key={u.name} className="flex items-center justify-between py-1 text-[11px] f-mono">
              <span>{u.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-neutral-500">{u.usageLabel}</span>
                <span className={u.verdictAmount >= 0 ? "text-teal-700" : "text-red-700"}>
                  {u.verdictAmount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(u.verdictAmount))}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {records.length > 0 && (
        <div className="mt-2 border-t border-dashed border-neutral-300 pt-2">
          {[...records].reverse().slice(0, 10).map((r) => (
            <div key={r.id} className="group flex items-center justify-between py-1 text-[11px] f-mono">
              <span className="text-neutral-500">{r.date}</span>
              <span className="flex items-center gap-2">
                {r.kind === "TOTAL" ? `已用 ${r.quantity}` : `+${r.quantity}`} {usageUnit}
                {r.unitPrice != null && <span className="text-neutral-400">@ {r.unitPrice}</span>}
                <button
                  onClick={async () => deleteUsageAction(subscriptionId, r.id)}
                  className="invisible text-red-700 group-hover:visible"
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
