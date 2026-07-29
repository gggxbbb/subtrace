"use client";

import { useState } from "react";
import { Led } from "@/components/te";
import { fmtMoney } from "@/lib/format";
import { MoneyFields } from "@/components/MoneyFields";
import {
  deletePaymentAction,
  updatePaymentAction,
} from "@/lib/subscriptions/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

const SOURCE_LABEL: Record<string, string> = {
  AUTO: "自动扣费",
  MANUAL: "手动续费",
  PROMO: "活动价",
  BUNDLE: "联合会员",
};

export interface HistoryPayment {
  id: string;
  /** null = 金额未知（ticket 12） */
  amount: number | null;
  currency: string | null;
  amountBase: number | null;
  refundedBase: number;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  source: string;
  note: string | null;
}

export function PaymentHistory({
  subscriptionId,
  payments,
  canEdit = true,
  estimatedRows = [],
  currency,
}: {
  subscriptionId: string;
  payments: HistoryPayment[];
  /** 仅所有者可编辑/删除（受益用户只读） */
  canEdit?: boolean;
  /** 未记账的推算段（ticket 09  polish）：底部强区分展示，非真实付费记录 */
  estimatedRows?: { start: string; end: string; net: number }[];
  currency: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (payments.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
        还没有付费记录
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {payments.map((p) =>
        editingId === p.id ? (
          <form
            key={p.id}
            action={async (formData) => {
              await updatePaymentAction(subscriptionId, p.id, formData);
            }}
            className="space-y-3 border-b border-black bg-[#E4E3E0] px-4 py-3"
          >
            <MoneyFields
              allowUnknown
              defaults={{ amount: p.amount, currency: p.currency, amountBase: p.amountBase }}
              labels={{ amount: "实付" }}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>支付日期</label>
                <input name="paidAt" type="date" defaultValue={p.paidAt} required className={`${inputCls} f-mono`} />
              </div>
              <div>
                <label className={labelCls}>服务起</label>
                <input name="periodStart" type="date" defaultValue={p.periodStart} required className={`${inputCls} f-mono`} />
              </div>
              <div>
                <label className={labelCls}>服务止</label>
                <input name="periodEnd" type="date" defaultValue={p.periodEnd} required className={`${inputCls} f-mono`} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>来源</label>
                <select name="source" defaultValue={p.source} className={inputCls}>
                  <option value="AUTO">自动扣费</option>
                  <option value="MANUAL">手动续费</option>
                  <option value="PROMO">活动价</option>
                  <option value="BUNDLE">联合会员</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>退款金额</label>
                <input name="refundedBase" type="number" step="0.01" min="0" defaultValue={p.refundedBase || undefined} placeholder="0.00" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>备注</label>
                <input name="note" defaultValue={p.note ?? ""} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
                保存 →
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="border border-black bg-white px-4 py-1.5 text-[11px] uppercase tracking-wider hover:bg-black hover:text-white"
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          <div
            key={p.id}
            className="group flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0"
          >
            <div>
              <div className="text-[13px] font-medium">
                {p.amountBase !== null ? (
                  <>
                    {fmtMoney(p.amountBase, currency)}
                    {p.refundedBase > 0 && (
                      <span className="ml-2 text-[10px] text-neutral-400 f-mono">
                        退 {fmtMoney(p.refundedBase, currency)} · 净 {fmtMoney(p.amountBase - p.refundedBase, currency)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-block border border-dashed border-neutral-400 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-neutral-400 f-mono">
                    金额未知
                  </span>
                )}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-neutral-400 f-mono">
                {p.periodStart} → {p.periodEnd} · {SOURCE_LABEL[p.source] ?? p.source}
                {p.note ? ` · ${p.note}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
              <button
                onClick={() => setEditingId(p.id)}
                className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-black hover:text-white"
              >
                编辑
              </button>
              )}
              {canEdit && (
              <button
                onClick={async () => {
                  if (confirm("删除这笔付费记录？锚点将回退重算。")) {
                    await deletePaymentAction(subscriptionId, p.id);
                  }
                }}
                className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase text-red-700 f-mono group-hover:visible hover:bg-red-700 hover:text-white"
              >
                删除
              </button>
              )}
              <Led color={p.source === "PROMO" ? "#FF5A00" : "#22c55e"} />
            </div>
          </div>
        ),
      )}
      {estimatedRows.length > 0 && (
        <div className="mt-auto border-t-2 border-dashed border-neutral-300">
          {estimatedRows.map((seg) => (
            <div
              key={seg.start}
              className="flex items-center justify-between border-b border-dashed border-neutral-200 bg-neutral-100/60 px-4 py-2.5 last:border-0"
            >
              <div>
                <div className="text-[13px] font-medium text-neutral-400">
                  {fmtMoney(seg.net, currency)}
                  <span className="ml-2 inline-block border border-dashed border-neutral-400 px-1.5 py-0.5 text-[9px] uppercase tracking-wider f-mono">
                    推算 · 未记账
                  </span>
                </div>
                <div className="text-[9px] uppercase tracking-wider text-neutral-400 f-mono">
                  {seg.start} → {seg.end} · 按标准价估计
                </div>
              </div>
              <Led color="#d4d4d4" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
