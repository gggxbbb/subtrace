"use client";

import { deletePurchaseAction, setPurchaseArchivedAction } from "@/lib/purchases/actions";
import { ConfirmButton } from "@/components/ConfirmButton";

/** 已归档物品列表：可取消归档或硬删除（二次确认） */
export function ArchivedPurchaseList({
  rows,
}: {
  rows: { id: string; name: string; category: string | null; status: string; purchaseDate: string }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] uppercase text-faint f-mono">
        没有已归档的物品
      </div>
    );
  }
  return (
    <div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[13px] last:border-0">
          <div className="min-w-0 truncate" title={r.name}>
            <a href={`/purchases/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </a>
            <span className="ml-2 text-[10px] text-faint f-mono">
              {r.category ?? "—"} · {r.status === "IN_USE" ? "持有中" : r.status === "SOLD" ? "已卖出" : "已报废"} · 购于 {r.purchaseDate}
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={async () => setPurchaseArchivedAction(r.id, false)}
              className="border border-ink bg-surface px-2.5 py-1 text-[10px] uppercase hover:bg-ink hover:text-surface"
            >
              取消归档
            </button>
            <ConfirmButton
              onConfirm={async () => deletePurchaseAction(r.id)}
              confirmLabel="确认删除（不可恢复）"
              className="border border-destructive bg-surface px-2.5 py-1 text-[10px] uppercase text-destructive hover:bg-destructive hover:text-white"
              confirmClassName="bg-destructive px-2.5 py-1 text-[10px] uppercase text-white hover:bg-destructive-hover"
              cancelClassName="border border-ink bg-surface px-2.5 py-1 text-[10px] uppercase hover:bg-ink hover:text-surface"
            />
          </span>
        </div>
      ))}
    </div>
  );
}
