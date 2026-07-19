"use client";

import { useState } from "react";
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
  verdict: {
    periodStart: string;
    periodEnd: string;
    cost: number;
    usage: number;
    value: number;
  } | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const last = records[records.length - 1];
  const [kind, setKind] = useState<"COUNT" | "QUOTA">(usageKind ?? "COUNT");
  const [unit, setUnit] = useState(usageUnit ?? "");
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
  const quotaPlaceholder =
    last?.quotaTotal ?? defaultQuotaTotal ?? undefined;
  const kindUnset = usageKind === null;

  // 回本提示：按参考单价还差多少用量回本
  const refPrice = last?.unitPrice ?? defaultUnitPrice;
  const needed =
    verdict && refPrice && refPrice > 0
      ? Math.max(0, Math.ceil((verdict.cost - verdict.value) / refPrice))
      : null;
  // 日历数据：从区间首日所在周的周一开始，到区间末日止
  const calDays: { day: number; inPeriod: boolean; used: boolean; today: boolean }[] = [];
  if (verdict) {
    const start = new Date(`${verdict.periodStart}T00:00:00Z`).getTime();
    const end = new Date(`${verdict.periodEnd}T00:00:00Z`).getTime();
    const todayMs = new Date(`${today}T00:00:00Z`).getTime();
    const usedDates = new Set(records.map((r) => r.date));
    // 对齐周一（UTC getUTCDay: 0=周日）
    const startDow = (new Date(start).getUTCDay() + 6) % 7;
    const calStart = start - startDow * 86_400_000;
    for (let t = calStart; t < end; t += 86_400_000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      calDays.push({
        day: new Date(t).getUTCDate(),
        inPeriod: t >= start,
        used: usedDates.has(iso),
        today: t === todayMs,
      });
    }
  }

  return (
    <div className="px-4 py-4">
      {kindUnset && (
        <div className="mb-3 grid grid-cols-[1fr_1fr] gap-2">
          <div className="grid grid-cols-2 gap-px border border-black bg-black">
            {(["COUNT", "QUOTA"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-2 py-1.5 text-[10px] uppercase f-mono ${kind === k ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
              >
                {k === "COUNT" ? "计数型" : "额度型"}
              </button>
            ))}
          </div>
          <input
            placeholder="单位：次 / 小时 / 点数"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={inputCls}
          />
        </div>
      )}

      {kind === "COUNT" ? (
        <form action={addUsageAction.bind(null, subscriptionId)} className="space-y-2">
          {kindUnset && (
            <>
              <input type="hidden" name="usageKind" value="COUNT" />
              <input type="hidden" name="usageUnit" value={unit} />
            </>
          )}
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
        <form action={addQuotaSnapshotAction.bind(null, subscriptionId)} className="space-y-2">
          {kindUnset && (
            <>
              <input type="hidden" name="usageKind" value="QUOTA" />
              <input type="hidden" name="usageUnit" value={unit} />
            </>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>日期</label>
              <input name="date" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
            </div>
            <div className="w-24">
              <label className={labelCls}>本次使用额度</label>
              <input name="used" type="number" step="1" min="0" placeholder="800" className={inputCls} />
            </div>
            <div className="w-16">
              <label className={labelCls}>或 %</label>
              <input name="percent" type="number" step="1" min="0" max="100" placeholder="65" className={inputCls} />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-28">
              <label className={labelCls}>当月总额度</label>
              <input
                name="quotaTotal"
                type="number"
                step="1"
                min="1"
                placeholder={quotaPlaceholder?.toString() ?? "1000"}
                className={inputCls}
              />
            </div>
            <div className="w-24">
              <label className={labelCls}>本次单价</label>
              <input
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder={pricePlaceholder?.toString() ?? "0.12"}
                className={inputCls}
              />
            </div>
            <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
              更新 →
            </button>
          </div>
          <div className="text-[9px] uppercase text-neutral-400 f-mono">
            留空继承上一条记录{quotaPlaceholder != null ? `（总额度 ${quotaPlaceholder}）` : ""}
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

/** 盈亏呈现卡：当前服务区间四指标 + 历史记录 */
export function UsageVerdictPanel({
  verdict: v,
  usageUnit,
  subscriptionId,
  records,
}: {
  verdict: {
    periodStart: string;
    periodEnd: string;
    cost: number;
    usage: number;
    value: number;
    verdictAmount: number;
    costPerUse: number | null;
  } | null;
  usageUnit: string | null;
  subscriptionId: string;
  records: UsageRecordRow[];
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
          <div className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${v.verdictAmount >= 0 ? "text-teal-700" : "text-red-700"}`}>
            {v.verdictAmount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(v.verdictAmount))}
            <Led color={v.verdictAmount >= 0 ? "#22c55e" : "#ef4444"} />
          </div>
        </div>
      </div>
      <div className="mt-3 border-t border-dashed border-neutral-300 pt-1.5 text-[9px] uppercase text-neutral-400 f-mono">
        {v.periodStart} → {v.periodEnd} · 价值 {fmtMoney(v.value)} − 成本 {fmtMoney(v.cost)}
      </div>
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
