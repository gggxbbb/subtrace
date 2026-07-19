"use client";

import { useState } from "react";
import {
  addPurchaseIncomeAction,
  deletePurchaseIncomeAction,
  updatePurchaseAction,
} from "@/lib/purchases/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

const fmtMoney = (n: number) =>
  n.toLocaleString("zh-CN", { style: "currency", currency: "CNY" });

/** 编辑物品（创建后仍可改） */
export function PurchaseEditForm({
  purchaseId,
  initial,
}: {
  purchaseId: string;
  initial: {
    name: string;
    category: string | null;
    amount: number;
    currency: string;
    amountBase: number;
    purchaseDate: string;
    expectedDays: number | null;
  };
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-black bg-white py-2.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-black hover:text-white"
      >
        编辑物品信息 →
      </button>
    );
  }
  return (
    <form action={updatePurchaseAction.bind(null, purchaseId)} className="space-y-3 px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>名称</label>
          <input name="name" defaultValue={initial.name} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>分类</label>
          <input name="category" defaultValue={initial.category ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>买入价</label>
          <input name="amount" type="number" step="0.01" min="0" defaultValue={initial.amount} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>币种</label>
          <input name="currency" defaultValue={initial.currency} className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>折算主币种</label>
          <input name="amountBase" type="number" step="0.01" min="0" defaultValue={initial.amountBase} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>购买日期</label>
          <input name="purchaseDate" type="date" defaultValue={initial.purchaseDate} required className={`${inputCls} f-mono`} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>预期寿命（天，留空=未定）</label>
          <input name="expectedDays" type="number" min="1" defaultValue={initial.expectedDays ?? ""} className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2">
        <button className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
          保存 →
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="border border-black bg-white px-4 py-1.5 text-[11px] uppercase tracking-wider hover:bg-black hover:text-white"
        >
          取消
        </button>
      </div>
    </form>
  );
}

export interface IncomeRow {
  id: string;
  amount: number;
  amountBase: number;
  date: string;
  note: string | null;
}

/** 收益记录：出租/返利等，抵减 TCO */
export function PurchaseIncomePanel({
  purchaseId,
  incomes,
}: {
  purchaseId: string;
  incomes: IncomeRow[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="px-4 py-4">
      <form action={addPurchaseIncomeAction.bind(null, purchaseId)} className="mb-3 flex items-end gap-2">
        <div className="w-28">
          <label className={labelCls}>金额</label>
          <input name="amount" type="number" step="0.01" min="0.01" required className={inputCls} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>日期</label>
          <input name="date" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>来源（可选）</label>
          <input name="note" placeholder="出租 3 天 / 返利" className={inputCls} />
        </div>
        <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
          记一笔 →
        </button>
      </form>
      {incomes.length === 0 ? (
        <p className="text-[11px] text-neutral-400">还没有收益记录——出租、返利等都可以记，自动抵减 TCO。</p>
      ) : (
        <div>
          {incomes.map((i) => (
            <div key={i.id} className="group flex items-center justify-between border-b border-dashed border-neutral-200 py-1.5 text-[12px] last:border-0">
              <span className="text-neutral-500 f-mono">{i.date}</span>
              <span className="flex items-center gap-2">
                <span className="text-teal-700 tabular-nums f-mono">+{fmtMoney(i.amountBase)}</span>
                {i.note && <span className="text-[10px] text-neutral-400">{i.note}</span>}
                <button
                  onClick={async () => deletePurchaseIncomeAction(purchaseId, i.id)}
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
