"use client";

import { deleteSubscriptionAction } from "@/lib/subscriptions/actions";
import { ConfirmButton } from "@/components/ConfirmButton";

/** 已归档订阅列表：可硬删除（二次确认） */
export function ArchivedList({
  rows,
}: {
  rows: { id: string; name: string; category: string | null; startDate: string }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
        没有已归档的订阅
      </div>
    );
  }
  return (
    <div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 text-[13px] last:border-0">
          <div className="min-w-0 truncate" title={r.name}>
            <a href={`/subscriptions/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </a>
            <span className="ml-2 text-[10px] text-neutral-400 f-mono">
              {r.category ?? "—"} · 始于 {r.startDate}
            </span>
          </div>
          <ConfirmButton
            onConfirm={async () => deleteSubscriptionAction(r.id)}
            confirmLabel="确认删除（不可恢复）"
            className="shrink-0 border border-red-700 bg-white px-2.5 py-1 text-[10px] uppercase text-red-700 hover:bg-red-700 hover:text-white"
            confirmClassName="bg-red-700 px-2.5 py-1 text-[10px] uppercase text-white hover:bg-red-800"
            cancelClassName="border border-black bg-white px-2.5 py-1 text-[10px] uppercase hover:bg-black hover:text-white"
          />
        </div>
      ))}
    </div>
  );
}
