"use client";

import { fmtMoney } from "@/lib/format";
import { IncomeFormFields } from "./income-fields";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  addPurchaseIncomeAction,
  deletePurchaseAction,
  deletePurchaseIncomeAction,
  setPurchaseArchivedAction,
} from "@/lib/purchases/actions";

const btnCls =
  "border border-black bg-white px-3 py-2 text-[10px] uppercase tracking-wider f-mono hover:bg-black hover:text-white";

/** 顶栏操作：编辑（独立页）、归档、删除（二次确认） */
export function PurchaseHeaderActions({
  purchaseId,
  archived,
}: {
  purchaseId: string;
  archived: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <a href={`/purchases/${purchaseId}/edit`} className={btnCls}>
        编辑 →
      </a>
      <button onClick={async () => setPurchaseArchivedAction(purchaseId, !archived)} className={`${btnCls} text-neutral-500`}>
        {archived ? "取消归档" : "归档"}
      </button>
      <ConfirmButton
        onConfirm={async () => deletePurchaseAction(purchaseId)}
        confirmLabel="确认删除（不可恢复）"
        className="border border-red-700 bg-white px-3 py-2 text-[10px] uppercase tracking-wider text-red-700 f-mono hover:bg-red-700 hover:text-white"
        confirmClassName="bg-red-700 px-3 py-2 text-[10px] uppercase tracking-wider text-white f-mono hover:bg-red-800"
        cancelClassName={btnCls}
      />
    </div>
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
  currency,
}: {
  purchaseId: string;
  incomes: IncomeRow[];
  currency: string;
}) {
  return (
    <div className="px-4 py-4">
      <form action={addPurchaseIncomeAction.bind(null, purchaseId)} className="mb-3 flex items-end gap-2">
        <IncomeFormFields currency={currency} dateFlex noteOptional />
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
                <span className="text-teal-700 tabular-nums f-mono">+{fmtMoney(i.amountBase, currency)}</span>
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
