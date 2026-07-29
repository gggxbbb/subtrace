"use client";

import { useState } from "react";
import { isoDay } from "@/lib/dates";
import { MoneyFields } from "@/components/MoneyFields";
import { useSearchParams } from "next/navigation";
import { recordPaymentAction } from "@/lib/subscriptions/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

const iso = (d: Date) => isoDay(d);

export function PaymentForm({
  subscriptionId,
  prefill,
}: {
  subscriptionId: string;
  prefill: {
    paidAt: string;
    periodStart: string;
    periodEnd: string;
    amount: number | null;
    currency: string;
  };
}) {
  const error = useSearchParams().get("error");
  const action = recordPaymentAction.bind(null, subscriptionId);
  const [periodStart, setPeriodStart] = useState(prefill.periodStart);
  const [periodEnd, setPeriodEnd] = useState(prefill.periodEnd);
  const [plusDays, setPlusDays] = useState("");

  const applyPlusDays = (v: string) => {
    setPlusDays(v);
    const n = Number(v);
    if (Number.isFinite(n) && v.trim() !== "" && periodStart) {
      const start = new Date(`${periodStart}T00:00:00+08:00`);
      setPeriodEnd(iso(new Date(start.getTime() + n * 86_400_000)));
    }
  };

  return (
    <form action={action} className="space-y-4 px-4 py-4">
      {error && (
        <div className="border border-black bg-[#FF5A00] px-3 py-2 text-[11px] uppercase text-white f-mono">
          {error === "fx"
            ? "币种无汇率：请先在设置→汇率添加币对，或手填折算金额"
            : "记录失败：请检查日期与金额"}
        </div>
      )}
      <MoneyFields
        allowUnknown
        defaults={{ amount: prefill.amount, currency: prefill.currency }}
        labels={{ amount: "实付金额" }}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>支付日期</label>
          <input name="paidAt" type="date" defaultValue={prefill.paidAt} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>服务起</label>
          <input
            name="periodStart"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            required
            className={`${inputCls} f-mono`}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>服务止（到期日）</label>
        <div className="flex border border-black bg-[#E4E3E0] focus-within:bg-white">
          <input
            name="periodEnd"
            type="date"
            value={periodEnd}
            onChange={(e) => {
              setPeriodEnd(e.target.value);
              setPlusDays("");
            }}
            required
            className="w-full bg-transparent px-2 py-1.5 text-sm outline-none f-mono"
          />
          <span className="flex items-center border-l border-black px-2 text-sm text-neutral-500 f-mono">
            +
          </span>
          <input
            type="number"
            min="1"
            placeholder="N 天"
            value={plusDays}
            onChange={(e) => applyPlusDays(e.target.value)}
            className="w-20 shrink-0 bg-transparent px-1 py-1.5 text-sm outline-none f-mono"
            title="按天数：服务止 = 服务起 + N 天"
          />
        </div>
        <div className="mt-1 text-[9px] uppercase text-neutral-400 f-mono">
          止期为排他日：到期日当天起不再覆盖 · 服务起 = 上一笔止期即无缝顺延 · 右侧 +N 天快速顺延
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>来源</label>
          <select name="source" defaultValue="MANUAL" className={inputCls}>
            <option value="AUTO">自动扣费</option>
            <option value="MANUAL">手动续费</option>
            <option value="PROMO">活动价</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>退款金额（可选）</label>
          <input name="refundedBase" type="number" step="0.01" min="0" placeholder="0.00" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>备注（可选）</label>
        <input name="note" placeholder="双十一活动价 108 元" className={inputCls} />
      </div>
      <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
        记一笔 →
      </button>
    </form>
  );
}
