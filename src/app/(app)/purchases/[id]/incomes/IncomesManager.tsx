"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { fmtMoney } from "@/lib/format";
import { IncomeFormFields } from "../income-fields";
import { inputCls, labelCls, ErrorBanner } from "@/components/te";
import {
  addPurchaseIncomeAction,
  deletePurchaseIncomeAction,
  updatePurchaseIncomeAction,
} from "@/lib/purchases/actions";


export interface IncomeRow {
  id: string;
  amount: number;
  currency: string;
  amountBase: number;
  date: string;
  note: string | null;
}


export function IncomesManager({
  purchaseId,
  rows,
  total,
  filters,
  back,
  currency,
}: {
  purchaseId: string;
  rows: IncomeRow[];
  total: number;
  filters: { q: string; from: string; to: string };
  back: string;
  currency: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const error = useSearchParams().get("error");
  const backInput = <input type="hidden" name="back" value={back} />;

  return (
    <>
      <ErrorBanner error={error} defaultMessage="保存失败：请检查日期与金额" className="mb-3" />
      <form method="GET" className="flex items-end gap-2 border border-ink bg-surface p-3">
        <div className="flex-1">
          <label className={labelCls}>来源包含</label>
          <input name="q" defaultValue={filters.q} placeholder="搜索来源/备注…" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>从</label>
          <input name="from" type="date" defaultValue={filters.from} className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>到</label>
          <input name="to" type="date" defaultValue={filters.to} className={`${inputCls} f-mono`} />
        </div>
        <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
          筛选
        </button>
        <a href={`/purchases/${purchaseId}/incomes`} className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
          重置
        </a>
        <button type="button" onClick={() => setAdding(!adding)} className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
          {adding ? "收起" : "+ 记一笔"}
        </button>
      </form>

      {adding && (
        <form action={addPurchaseIncomeAction.bind(null, purchaseId)} className="flex items-end gap-2 border border-ink bg-surface p-3">
          {backInput}
          <IncomeFormFields currency={currency} noteOptional />
          <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
            保存 →
          </button>
        </form>
      )}

      <div className="text-[10px] uppercase text-faint f-mono">
        {rows.length} / {total} 条 · 合计{" "}
        <span className="text-income">{fmtMoney(rows.reduce((s, r) => s + r.amountBase, 0), currency)}</span>
      </div>

      <div className="border border-ink bg-surface">
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
            没有匹配的收益记录
          </div>
        )}
        {rows.map((r) =>
          editingId === r.id ? (
            <form key={r.id} action={updatePurchaseIncomeAction.bind(null, purchaseId, r.id)} className="flex items-end gap-2 border-b border-ink bg-base px-4 py-3">
              {backInput}
              <IncomeFormFields
                currency={currency}
                defaults={{ amount: r.amount, currency: r.currency, amountBase: r.amountBase, date: r.date, note: r.note }}
              />
              <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
                保存
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
                取消
              </button>
            </form>
          ) : (
            <div key={r.id} className="group flex items-center justify-between border-b border-line px-4 py-2 last:border-0">
              <div className="text-[12px] f-mono">
                <span className="text-muted">{r.date}</span>
                <span className="ml-2 text-income tabular-nums">+{fmtMoney(r.amountBase, currency)}</span>
                {r.note && <span className="ml-2 text-faint">{r.note}</span>}
              </div>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setEditingId(r.id)}
                  className="invisible border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-ink hover:text-surface"
                >
                  编辑
                </button>
                <button
                  onClick={async () => deletePurchaseIncomeAction(purchaseId, r.id, back)}
                  className="invisible border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase text-destructive f-mono group-hover:visible hover:bg-destructive hover:text-white"
                >
                  删除
                </button>
              </span>
            </div>
          ),
        )}
      </div>
    </>
  );
}
