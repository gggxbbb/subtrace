"use client";

import { isoDay } from "@/lib/dates";
import { MoneyFields } from "@/components/MoneyFields";
import { createPurchaseAction } from "@/lib/purchases/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export function PurchaseNewForm({ baseCurrency, error }: { baseCurrency: string; error: string | null }) {
  const today = isoDay(new Date());

  return (
    <div className="mx-auto max-w-xl px-4 py-8 md:px-6">
      <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
        purchases / new
      </div>
      <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">登记物品</h1>
      {error && (
        <div className="mb-4 border border-black bg-[#FF5A00] px-3 py-2 text-[11px] uppercase text-white f-mono">
          {error === "fx"
            ? "币种无汇率：请先在设置→汇率添加币对，或手填折算金额"
            : "登记失败：请检查必填项"}
        </div>
      )}
      <form action={createPurchaseAction} className="space-y-4 border border-black bg-white p-5">
        <div>
          <label className={labelCls}>名称</label>
          <input name="name" required placeholder="索尼 WH-1000XM5" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>分类（可选）</label>
          <input name="category" placeholder="数码 / 家具…" className={inputCls} />
        </div>
        <MoneyFields defaults={{ currency: baseCurrency }} labels={{ amount: "买入价" }} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>购买日期</label>
            <input name="purchaseDate" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
          </div>
          <div>
            <label className={labelCls}>预期寿命（天，可选）</label>
            <input name="expectedDays" type="number" min="1" placeholder="730" className={inputCls} />
          </div>
        </div>
        <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
          登记 →
        </button>
      </form>
    </div>
  );
}
