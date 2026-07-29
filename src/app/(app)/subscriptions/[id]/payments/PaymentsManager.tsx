"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { inputCls, labelCls, ErrorBanner } from "@/components/te";
import {
  deletePaymentAction,
  recordPaymentAction,
  updatePaymentAction,
} from "@/lib/subscriptions/actions";
import {
  PaymentEditFields,
  PaymentRowDisplay,
  type PaymentRow,
} from "../payment-rows";

export type { PaymentRow };

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
  const error = useSearchParams().get("error");
  const backInput = <input type="hidden" name="back" value={back} />;

  return (
    <>
      <ErrorBanner error={error} defaultMessage="保存失败：请检查日期与金额" className="mb-3" />
      {/* 筛选：GET 表单，query 可分享 */}
      <form method="GET" className="flex items-end gap-2 border border-ink bg-surface p-3">
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
        <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
          筛选
        </button>
        <a href={`/subscriptions/${subscriptionId}/payments`} className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
          重置
        </a>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding(!adding)}
            className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface"
          >
            {adding ? "收起" : "+ 记一笔"}
          </button>
        )}
      </form>

      {adding && (
        <form action={recordPaymentAction.bind(null, subscriptionId)} className="space-y-3 border border-ink bg-surface p-4">
          {backInput}
          <div className="text-[10px] uppercase tracking-wider text-muted f-mono">新增付费记录</div>
          <PaymentEditFields defaultCurrency={defaultCurrency} variant="manager" />
          <button className="bg-ink px-4 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
            保存 →
          </button>
        </form>
      )}

      <div className="text-[10px] uppercase text-faint f-mono">
        {rows.length} / {total} 条
      </div>

      <div className="border border-ink bg-surface">
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
            没有匹配的付费记录
          </div>
        )}
        {rows.map((p) =>
          editingId === p.id ? (
            <form key={p.id} action={updatePaymentAction.bind(null, subscriptionId, p.id)} className="space-y-3 border-b border-ink bg-base px-4 py-3">
              {backInput}
              <PaymentEditFields row={p} defaultCurrency={defaultCurrency} variant="manager" />
              <div className="flex gap-2">
                <button className="bg-ink px-4 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
                  保存 →
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="border border-ink bg-surface px-4 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
                  取消
                </button>
              </div>
            </form>
          ) : (
            <PaymentRowDisplay
              key={p.id}
              p={p}
              currency={currency}
              showPaidAt
              canEdit={canEdit}
              onEdit={() => setEditingId(p.id)}
              onDelete={async () => {
                await deletePaymentAction(subscriptionId, p.id, back);
              }}
            />
          ),
        )}
      </div>
    </>
  );
}
