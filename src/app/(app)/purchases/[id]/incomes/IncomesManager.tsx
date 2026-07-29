"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { MoneyFields } from "@/components/MoneyFields";
import { inputCls, labelCls } from "@/components/te";
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

const today = () => isoDay(new Date());

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
      {error && (
        <div className="mb-3 border border-black bg-[#FF5A00] px-3 py-2 text-[11px] uppercase text-white f-mono">
          {error === "fx"
            ? "币种无汇率：请先在设置→汇率添加币对，或手填折算金额"
            : "保存失败：请检查日期与金额"}
        </div>
      )}
      <form method="GET" className="flex items-end gap-2 border border-black bg-white p-3">
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
        <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
          筛选
        </button>
        <a href={`/purchases/${purchaseId}/incomes`} className="border border-black bg-white px-3 py-1.5 text-[11px] uppercase hover:bg-black hover:text-white">
          重置
        </a>
        <button type="button" onClick={() => setAdding(!adding)} className="border border-black bg-white px-3 py-1.5 text-[11px] uppercase hover:bg-black hover:text-white">
          {adding ? "收起" : "+ 记一笔"}
        </button>
      </form>

      {adding && (
        <form action={addPurchaseIncomeAction.bind(null, purchaseId)} className="flex items-end gap-2 border border-black bg-white p-3">
          {backInput}
          <MoneyFields layout="inline" defaults={{ currency }} />
          <div>
            <label className={labelCls}>日期</label>
            <input name="date" type="date" defaultValue={today()} required className={`${inputCls} f-mono`} />
          </div>
          <div className="flex-1">
            <label className={labelCls}>来源（可选）</label>
            <input name="note" placeholder="出租 3 天 / 返利" className={inputCls} />
          </div>
          <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
            保存 →
          </button>
        </form>
      )}

      <div className="text-[10px] uppercase text-neutral-400 f-mono">
        {rows.length} / {total} 条 · 合计{" "}
        <span className="text-teal-700">{fmtMoney(rows.reduce((s, r) => s + r.amountBase, 0), currency)}</span>
      </div>

      <div className="border border-black bg-white">
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] uppercase text-neutral-400 f-mono">
            没有匹配的收益记录
          </div>
        )}
        {rows.map((r) =>
          editingId === r.id ? (
            <form key={r.id} action={updatePurchaseIncomeAction.bind(null, purchaseId, r.id)} className="flex items-end gap-2 border-b border-black bg-[#E4E3E0] px-4 py-3">
              {backInput}
              <MoneyFields layout="inline" defaults={{ amount: r.amount, currency: r.currency, amountBase: r.amountBase }} />
              <div>
                <label className={labelCls}>日期</label>
                <input name="date" type="date" defaultValue={r.date} required className={`${inputCls} f-mono`} />
              </div>
              <div className="flex-1">
                <label className={labelCls}>来源</label>
                <input name="note" defaultValue={r.note ?? ""} className={inputCls} />
              </div>
              <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
                保存
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="border border-black bg-white px-3 py-1.5 text-[11px] uppercase hover:bg-black hover:text-white">
                取消
              </button>
            </form>
          ) : (
            <div key={r.id} className="group flex items-center justify-between border-b border-neutral-200 px-4 py-2 last:border-0">
              <div className="text-[12px] f-mono">
                <span className="text-neutral-500">{r.date}</span>
                <span className="ml-2 text-teal-700 tabular-nums">+{fmtMoney(r.amountBase, currency)}</span>
                {r.note && <span className="ml-2 text-neutral-400">{r.note}</span>}
              </div>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setEditingId(r.id)}
                  className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-black hover:text-white"
                >
                  编辑
                </button>
                <button
                  onClick={async () => deletePurchaseIncomeAction(purchaseId, r.id, back)}
                  className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase text-red-700 f-mono group-hover:visible hover:bg-red-700 hover:text-white"
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
