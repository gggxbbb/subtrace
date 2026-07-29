"use client";

import { useState } from "react";
import { Led } from "@/components/te";
import { fmtMoney } from "@/lib/format";
import {
  PaymentEditFields,
  PaymentRowDisplay,
  type PaymentRow,
} from "./payment-rows";
import {
  deletePaymentAction,
  updatePaymentAction,
} from "@/lib/subscriptions/actions";

export type { PaymentRow };

export function PaymentHistory({
  subscriptionId,
  payments,
  canEdit = true,
  estimatedRows = [],
  currency,
}: {
  subscriptionId: string;
  payments: PaymentRow[];
  /** 仅所有者可编辑/删除（受益用户只读） */
  canEdit?: boolean;
  /** 未记账的推算段：底部强区分展示，非真实付费记录 */
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
            <PaymentEditFields row={p} defaultCurrency={p.currency ?? currency} variant="panel" />
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
          <PaymentRowDisplay
            key={p.id}
            p={p}
            currency={currency}
            showPaidAt={false}
            canEdit={canEdit}
            onEdit={() => setEditingId(p.id)}
            onDelete={async () => {
              if (confirm("删除这笔付费记录？锚点将回退重算。")) {
                await deletePaymentAction(subscriptionId, p.id);
              }
            }}
          />
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
