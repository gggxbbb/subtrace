"use client";

// 邀请管理面板（ADMIN）：生成链接、邀请列表（状态/吊销）。

import { useState, useTransition } from "react";
import { createInviteAction, revokeInviteAction } from "@/lib/auth/actions";
import type { InviteView } from "@/lib/auth/service";

export type InviteRow = Omit<InviteView, "expiresAt" | "createdAt"> & {
  expiresAt: string;
  createdAt: string;
};

function statusOf(inv: InviteRow): { label: string; cls: string } {
  if (inv.usedBy) return { label: `已使用 · ${inv.usedBy}`, cls: "text-neutral-400" };
  if (new Date(inv.expiresAt) < new Date()) return { label: "已过期", cls: "text-neutral-400" };
  return { label: "待使用", cls: "text-[#FF6B00]" };
}

export function InviteManager({ invites }: { invites: InviteRow[] }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  return (
    <div className="border border-black bg-white">
      <div className="flex items-center justify-between border-b border-black bg-black px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white f-mono">
        <span>02 — 邀请 / {invites.length}</span>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const token = await createInviteAction();
              setLink(`${location.origin}/register?invite=${token}`);
            })
          }
          className="bg-white px-2.5 py-1 text-[9px] uppercase tracking-wider text-black f-mono hover:bg-[#FF6B00] hover:text-white disabled:opacity-40"
        >
          生成邀请链接
        </button>
      </div>
      {link && (
        <div className="flex items-center gap-2 border-b border-black bg-[#E4E3E0] px-4 py-2">
          <span className="flex-1 break-all text-[10px] f-mono">{link}</span>
          <button
            onClick={() => navigator.clipboard.writeText(link)}
            className="border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono hover:bg-black hover:text-white"
          >
            复制
          </button>
        </div>
      )}
      {invites.length === 0 && (
        <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
          还没有邀请记录
        </div>
      )}
      {invites.map((inv) => {
        const st = statusOf(inv);
        const revocable = !inv.usedBy && new Date(inv.expiresAt) >= new Date();
        return (
          <div key={inv.token} className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2.5 last:border-0">
            <span className="flex-1 truncate text-[11px] f-mono">{inv.token.slice(0, 8)}…</span>
            <span className="text-[10px] text-neutral-500 f-mono">
              {inv.createdBy} · {inv.createdAt} 创建 · {inv.expiresAt} 到期
            </span>
            <span className={`text-[10px] uppercase f-mono ${st.cls}`}>{st.label}</span>
            {revocable && (
              <button
                disabled={pending}
                onClick={() => start(() => revokeInviteAction(inv.token))}
                className="border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono text-[#ef4444] hover:bg-[#ef4444] hover:text-white disabled:opacity-40"
              >
                吊销
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
