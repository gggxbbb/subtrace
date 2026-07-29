"use client";

import { useState } from "react";
import { isoDay } from "@/lib/dates";
import { MoneyFields } from "@/components/MoneyFields";
import { fmtMoney } from "@/lib/format";
import { Led } from "@/components/te";
import {
  deletePaymentAction,
  recordPaymentAction,
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

export interface PaymentRow {
  id: string;
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

const today = () => isoDay(new Date());

/** 单笔表单字段（新增/编辑共用） */
function PaymentFields({ row, defaultCurrency }: { row?: PaymentRow; defaultCurrency: string }) {
  return (
    <>
      <MoneyFields
        allowUnknown
        defaults={{
          amount: row?.amount,
          currency: row?.currency ?? defaultCurrency,
          amountBase: row?.amountBase,
        }}
        labels={{ amount: "实付" }}
      />
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>支付日期</label>
          <input name="paidAt" type="date" defaultValue={row?.paidAt ?? today()} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>服务起</label>
          <input name="periodStart" type="date" defaultValue={row?.periodStart ?? today()} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>服务止</label>
          <input name="periodEnd" type="date" defaultValue={row?.periodEnd} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>来源</label>
          <select name="source" defaultValue={row?.source ?? "MANUAL"} className={inputCls}>
            <option value="AUTO">自动扣费</option>
            <option value="MANUAL">手动续费</option>
            <option value="PROMO">活动价</option>
            <option value="BUNDLE">联合会员</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>退款</label>
          <input name="refundedBase" type="number" step="0.01" min="0" defaultValue={row?.refundedBase ?? 0} className={inputCls} />
        </div>
        <div className="col-span-3">
          <label className={labelCls}>备注</label>
          <input name="note" defaultValue={row?.note ?? ""} className={inputCls} />
        </div>
      </div>
    </>
  );
}

export function PaymentsManager({
  subscriptionId,
  rows,
  total,
  filters,
  back,
  canEdit,
  defaultCurrency,
  currency,
}: {
  subscriptionId: string;
  rows: PaymentRow[];
  total: number;
  filters: { q: string; source: string; from: string; to: string };
  back: string;
  canEdit: boolean;
  defaultCurrency: string;
  currency: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const backInput = <input type="hidden" name="back" value={back} />;

  return (
    <>
      {/* 筛选：GET 表单，query 可分享 */}
      <form method="GET" className="flex items-end gap-2 border border-black bg-white p-3">
        <div className="flex-1">
          <label className={labelCls}>备注包含</label>
          <input name="q" defaultValue={filters.q} placeholder="搜索备注…" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>来源</label>
          <select name="source" defaultValue={filters.source} className={inputCls}>
            <option value="">全部</option>
            <option value="AUTO">自动扣费</option>
            <option value="MANUAL">手动续费</option>
            <option value="PROMO">活动价</option>
            <option value="BUNDLE">联合会员</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>支付从</label>
          <input name="from" type="date" defaultValue={filters.from} className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>到</label>
          <input name="to" type="date" defaultValue={filters.to} className={`${inputCls} f-mono`} />
        </div>
        <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
          筛选
        </button>
        <a href={`/subscriptions/${subscriptionId}/payments`} className="border border-black bg-white px-3 py-1.5 text-[11px] uppercase hover:bg-black hover:text-white">
          重置
        </a>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding(!adding)}
            className="border border-black bg-white px-3 py-1.5 text-[11px] uppercase hover:bg-black hover:text-white"
          >
            {adding ? "收起" : "+ 记一笔"}
          </button>
        )}
      </form>

      {adding && (
        <form action={recordPaymentAction.bind(null, subscriptionId)} className="space-y-3 border border-black bg-white p-4">
          {backInput}
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 f-mono">新增付费记录</div>
          <PaymentFields defaultCurrency={defaultCurrency} />
          <button className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
            保存 →
          </button>
        </form>
      )}

      <div className="text-[10px] uppercase text-neutral-400 f-mono">
        {rows.length} / {total} 条
      </div>

      <div className="border border-black bg-white">
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] uppercase text-neutral-400 f-mono">
            没有匹配的付费记录
          </div>
        )}
        {rows.map((p) =>
          editingId === p.id ? (
            <form key={p.id} action={updatePaymentAction.bind(null, subscriptionId, p.id)} className="space-y-3 border-b border-black bg-[#E4E3E0] px-4 py-3">
              {backInput}
              <PaymentFields row={p} defaultCurrency={defaultCurrency} />
              <div className="flex gap-2">
                <button className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
                  保存 →
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="border border-black bg-white px-4 py-1.5 text-[11px] uppercase hover:bg-black hover:text-white">
                  取消
                </button>
              </div>
            </form>
          ) : (
            <div key={p.id} className="group flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0">
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
                  支付 {p.paidAt} · {p.periodStart} → {p.periodEnd} · {SOURCE_LABEL[p.source] ?? p.source}
                  {p.note ? ` · ${p.note}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      onClick={() => setEditingId(p.id)}
                      className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-black hover:text-white"
                    >
                      编辑
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("删除这笔付费记录？锚点将回退重算。")) {
                          await deletePaymentAction(subscriptionId, p.id, back);
                        }
                      }}
                      className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase text-red-700 f-mono group-hover:visible hover:bg-red-700 hover:text-white"
                    >
                      删除
                    </button>
                  </>
                )}
                <Led color={p.source === "PROMO" ? "#FF5A00" : "#22c55e"} />
              </div>
            </div>
          ),
        )}
      </div>
    </>
  );
}
