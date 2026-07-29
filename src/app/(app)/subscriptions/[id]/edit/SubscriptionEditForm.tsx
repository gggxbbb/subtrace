"use client";

import { useState } from "react";
import { MoneyFields } from "@/components/MoneyFields";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export interface SubscriptionEditInitial {
  name: string;
  category: string | null;
  trackingMode: "CYCLE" | "MANUAL";
  cycleKind: "CALENDAR" | "FIXED_DAYS";
  cycleUnit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  cycleCount: number;
  fixedDays: number | null;
  listPrice: number | null;
  listPriceBase: number | null;
  listCurrency: string;
  autoRenew: boolean;
  remindDays: string;
  startDate: string;
}

export function SubscriptionEditForm({
  subscriptionId,
  action,
  initial,
}: {
  subscriptionId: string;
  action: (formData: FormData) => Promise<void>;
  initial: SubscriptionEditInitial;
}) {
  const [cycleKind, setCycleKind] = useState(initial.cycleKind);
  return (
    <form action={action} className="space-y-4 border border-black bg-white p-5">
      <input type="hidden" name="cycleKind" value={cycleKind} />
      <div>
        <label className={labelCls}>名称</label>
        <input name="name" defaultValue={initial.name} required className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>分类（可选）</label>
        <input name="category" defaultValue={initial.category ?? ""} className={inputCls} />
      </div>

      {initial.trackingMode === "CYCLE" && (
        <>
          <div>
            <label className={labelCls}>计费周期</label>
            <div className="grid grid-cols-2 gap-px border border-black bg-black">
              {(
                [
                  ["CALENDAR", "日历周期"],
                  ["FIXED_DAYS", "固定天数"],
                ] as const
              ).map(([k, label]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setCycleKind(k)}
                  className={`px-3 py-2 text-[11px] uppercase tracking-wider f-mono ${cycleKind === k ? "bg-black text-white" : "bg-white hover:bg-[#E4E3E0]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {cycleKind === "CALENDAR" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>每</label>
                <input name="cycleCount" type="number" min="1" defaultValue={initial.cycleCount} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>单位</label>
                <select name="cycleUnit" defaultValue={initial.cycleUnit} className={inputCls}>
                  <option value="DAY">日</option>
                  <option value="WEEK">周</option>
                  <option value="MONTH">月</option>
                  <option value="YEAR">年</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelCls}>每 N 天</label>
              <input name="fixedDays" type="number" min="1" defaultValue={initial.fixedDays ?? ""} placeholder="30" required className={inputCls} />
            </div>
          )}
          <MoneyFields
            names={{ amount: "listPrice", currency: "listCurrency", amountBase: "listPriceBase" }}
            defaults={{
              amount: initial.listPrice,
              currency: initial.listCurrency,
              amountBase: initial.listPriceBase,
            }}
            labels={{ amount: "标准价", amountBase: "折算主币种" }}
          />
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" name="autoRenew" defaultChecked={initial.autoRenew} className="h-4 w-4 accent-black" />
            自动续费（到期自动扣款）
          </label>
        </>
      )}

      <div>
        <label className={labelCls}>起始日期</label>
        <input name="startDate" type="date" defaultValue={initial.startDate} required className={`${inputCls} f-mono`} />
      </div>

      <div>
        <label className={labelCls}>提醒天数</label>
        <input name="remindDays" defaultValue={initial.remindDays} className={`${inputCls} f-mono`} />
        <p className="mt-1 text-[9px] uppercase text-neutral-400 f-mono">
          逗号分隔；到期前 N 天经通知渠道提醒 · 留空 = 不提醒
        </p>
      </div>

      <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
        保存 →
      </button>
      <a
        href={`/subscriptions/${subscriptionId}`}
        className="block border border-black bg-white py-2.5 text-center text-[11px] uppercase tracking-wider hover:bg-black hover:text-white"
      >
        取消
      </a>
    </form>
  );
}
