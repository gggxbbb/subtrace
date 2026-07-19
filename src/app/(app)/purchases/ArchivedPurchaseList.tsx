"use client";

import { useState } from "react";
import { deletePurchaseAction, setPurchaseArchivedAction } from "@/lib/purchases/actions";

/** 已归档物品列表：可取消归档或硬删除（二次确认） */
export function ArchivedPurchaseList({
  rows,
}: {
  rows: { id: string; name: string; category: string | null; status: string; purchaseDate: string }[];
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
        没有已归档的物品
      </div>
    );
  }
  return (
    <div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 text-[13px] last:border-0">
          <div>
            <a href={`/purchases/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </a>
            <span className="ml-2 text-[10px] text-neutral-400 f-mono">
              {r.category ?? "—"} · {r.status === "IN_USE" ? "持有中" : r.status === "SOLD" ? "已卖出" : "已报废"} · 购于 {r.purchaseDate}
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <button
              onClick={async () => setPurchaseArchivedAction(r.id, false)}
              className="border border-black bg-white px-2.5 py-1 text-[10px] uppercase hover:bg-black hover:text-white"
            >
              取消归档
            </button>
            {confirmId === r.id ? (
              <>
                <button
                  onClick={async () => deletePurchaseAction(r.id)}
                  className="bg-red-700 px-2.5 py-1 text-[10px] uppercase text-white hover:bg-red-800"
                >
                  确认删除（不可恢复）
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="border border-black bg-white px-2.5 py-1 text-[10px] uppercase hover:bg-black hover:text-white"
                >
                  算了
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmId(r.id)}
                className="border border-red-700 bg-white px-2.5 py-1 text-[10px] uppercase text-red-700 hover:bg-red-700 hover:text-white"
              >
                删除
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
