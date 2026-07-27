"use client";

import { useState } from "react";
import { deleteSubscriptionAction } from "@/lib/subscriptions/actions";

/** 已归档订阅列表：可硬删除（二次确认） */
export function ArchivedList({
  rows,
}: {
  rows: { id: string; name: string; category: string | null; startDate: string }[];
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
          {confirmId === r.id ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={async () => deleteSubscriptionAction(r.id)}
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
            </span>
          ) : (
            <button
              onClick={() => setConfirmId(r.id)}
              className="shrink-0 border border-red-700 bg-white px-2.5 py-1 text-[10px] uppercase text-red-700 hover:bg-red-700 hover:text-white"
            >
              删除
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
