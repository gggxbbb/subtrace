"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { isoDay } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { MoneyFields } from "@/components/MoneyFields";
import { EVENT_KIND_LABEL } from "@/lib/purchases/kinds";
import {
  addPurchaseEventAction,
  deletePurchaseEventAction,
  updatePurchaseEventAction,
} from "@/lib/purchases/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export interface EventRow {
  id: string;
  kind: string;
  amount: number;
  currency: string;
  amountBase: number;
  date: string;
  extendDays: number | null;
  note: string | null;
}

const today = () => isoDay(new Date());

function EventFields({ row, currency }: { row?: EventRow; currency: string }) {
  const [kind, setKind] = useState(row?.kind ?? "ACCESSORY");
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <div>
        <label className={labelCls}>类型</label>
        <div className="grid grid-cols-3 gap-px border border-black bg-black">
          {(["ACCESSORY", "REPAIR", "OTHER"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-2 py-1.5 text-[10px] uppercase f-mono ${kind === k ? "bg-black text-white" : "bg-white hover:bg-[#E4E3E0]"}`}
            >
              {EVENT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <MoneyFields layout="inline" defaults={{ amount: row?.amount, currency: row?.currency ?? currency, amountBase: row?.amountBase }} />
      <div>
        <label className={labelCls}>日期</label>
        <input name="date" type="date" defaultValue={row?.date ?? today()} required className={`${inputCls} f-mono`} />
      </div>
      {kind === "REPAIR" && (
        <div className="w-32">
          <label className={labelCls}>延长寿命（天）</label>
          <input name="extendDays" type="number" min="0" defaultValue={row?.extendDays ?? ""} placeholder="可选" className={inputCls} />
        </div>
      )}
      <div className="flex-1">
        <label className={labelCls}>备注（可选）</label>
        <input name="note" defaultValue={row?.note ?? ""} placeholder="换屏 / 手机壳" className={inputCls} />
      </div>
    </>
  );
}

/** 追加费用事件：计入净额共用摊销窗口；维修可延长寿命 */
export function PurchaseEventsPanel({
  purchaseId,
  events,
  currency,
}: {
  purchaseId: string;
  events: EventRow[];
  currency: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const error = useSearchParams().get("error");

  return (
    <div className="px-4 py-4">
      {error && (
        <div className="mb-3 border border-black bg-[#FF5A00] px-3 py-2 text-[11px] uppercase text-white f-mono">
          {error === "fx"
            ? "币种无汇率：请先在设置→汇率添加币对，或手填折算金额"
            : "保存失败：请检查日期与金额"}
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase text-neutral-400 f-mono">
          计入物品净额，与买入价共用同一摊销窗口
        </span>
        <button
          onClick={() => setAdding(!adding)}
          className="border border-black bg-white px-2 py-1 text-[10px] uppercase f-mono hover:bg-black hover:text-white"
        >
          {adding ? "收起" : "+ 记一笔"}
        </button>
      </div>

      {adding && (
        <form action={addPurchaseEventAction.bind(null, purchaseId)} className="mb-3 flex items-end gap-2 border border-black bg-[#E4E3E0] p-3">
          <EventFields currency={currency} />
          <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
            保存 →
          </button>
        </form>
      )}

      {events.length === 0 && !adding && (
        <p className="text-[11px] text-neutral-400">还没有追加费用——配件、维修都可以记。</p>
      )}

      {events.map((e) =>
        editingId === e.id ? (
          <form key={e.id} action={updatePurchaseEventAction.bind(null, purchaseId, e.id)} className="mb-2 flex items-end gap-2 border border-black bg-[#E4E3E0] p-3">
            <EventFields row={e} currency={currency} />
            <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
              保存
            </button>
            <button type="button" onClick={() => setEditingId(null)} className="border border-black bg-white px-3 py-1.5 text-[11px] uppercase hover:bg-black hover:text-white">
              取消
            </button>
          </form>
        ) : (
          <div key={e.id} className="group flex items-center justify-between border-b border-dashed border-neutral-200 py-1.5 text-[12px] last:border-0">
            <span className="f-mono">
              <span className="text-neutral-500">{e.date}</span>
              <span className="ml-2 border border-black px-1 text-[9px] uppercase">{EVENT_KIND_LABEL[e.kind] ?? e.kind}</span>
              {e.note && <span className="ml-2 text-neutral-500">{e.note}</span>}
              {e.extendDays != null && e.extendDays > 0 && (
                <span className="ml-1 text-[10px] text-teal-700">寿命+{e.extendDays}d</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums f-mono">{fmtMoney(e.amountBase, currency)}</span>
              <button
                onClick={() => setEditingId(e.id)}
                className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-black hover:text-white"
              >
                编辑
              </button>
              <button
                onClick={async () => deletePurchaseEventAction(purchaseId, e.id)}
                className="invisible text-red-700 group-hover:visible"
              >
                ×
              </button>
            </span>
          </div>
        ),
      )}
    </div>
  );
}
