"use client";

import { useSearchParams } from "next/navigation";
import { recordPaymentAction } from "@/lib/subscriptions/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

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

  return (
    <form action={action} className="space-y-4 px-4 py-4">
      {error && (
        <div className="border border-black bg-[#FF5A00] px-3 py-2 text-[11px] uppercase text-white f-mono">
          记录失败：请检查日期与金额
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>实付金额</label>
          <input name="amount" type="number" step="0.01" min="0" defaultValue={prefill.amount ?? undefined} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>币种</label>
          <input name="currency" defaultValue={prefill.currency} className={`${inputCls} f-mono`} />
        </div>
      </div>
      <div>
        <label className={labelCls}>折算主币种金额（快照，默认同实付）</label>
        <input name="amountBase" type="number" step="0.01" min="0" placeholder="留空 = 实付金额" className={inputCls} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>支付日期</label>
          <input name="paidAt" type="date" defaultValue={prefill.paidAt} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>服务起</label>
          <input name="periodStart" type="date" defaultValue={prefill.periodStart} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>服务止（到期日）</label>
          <input name="periodEnd" type="date" defaultValue={prefill.periodEnd} required className={`${inputCls} f-mono`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
