"use client";

import { useState } from "react";
import { isoDay } from "@/lib/dates";
import { Led, inputCls, labelCls } from "@/components/te";
import { addPackAction, deletePackAction, updatePackAction } from "@/lib/usage/actions";

export interface PackRow {
  id: string;
  grantedAt: string;
  quantity: number;
  expiresAt: string;
  source: string;
}

/** 包管理卡（ADR-0012）：手动包增删改 + AUTO 只读列表（生成器读时对齐，ticket 03） */
export function PacksPanel({
  subscriptionId,
  packs,
  isOwner,
  usageUnit,
  nextGrant,
}: {
  subscriptionId: string;
  packs: PackRow[];
  isOwner: boolean;
  usageUnit: string | null;
  /** 「下期将下发」临时推导（未来包不物化）；手动模式/缺配置为 null */
  nextGrant?: { date: string; quantity: number } | null;
}) {
  const today = isoDay(new Date());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const manual = packs.filter((p) => p.source !== "AUTO");
  const auto = packs.filter((p) => p.source === "AUTO");

  return (
    <div className="px-4 py-4">
      {isOwner && (
        <div className="mb-3">
          {adding ? (
            <form action={addPackAction.bind(null, subscriptionId)} className="flex items-end gap-2">
              <div>
                <label className={labelCls}>下发日</label>
                <input name="grantedAt" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
              </div>
              <div>
                <label className={labelCls}>数量{usageUnit ? `（${usageUnit}）` : ""}</label>
                <input name="quantity" type="number" step="any" min="0.01" required className={`${inputCls} w-24`} />
              </div>
              <div>
                <label className={labelCls}>到期日（当天起不可用）</label>
                <input name="expiresAt" type="date" required className={`${inputCls} f-mono`} />
              </div>
              <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
                保存 →
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface"
              >
                取消
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="border border-ink bg-surface px-3 py-1.5 text-[10px] uppercase tracking-wider f-mono hover:bg-ink hover:text-surface"
            >
              + 手动补录包（赠送/活动额度）
            </button>
          )}
        </div>
      )}

      {packs.length === 0 && (
        <div className="py-3 text-center text-[11px] uppercase text-faint f-mono">
          还没有额度包{isOwner ? "，点上方补录" : ""}
        </div>
      )}

      {manual.map((p) =>
        editingId === p.id ? (
          <form
            key={p.id}
            action={updatePackAction.bind(null, subscriptionId, p.id)}
            className="flex items-end gap-2 border-b border-ink bg-base px-2 py-2"
          >
            <div>
              <label className={labelCls}>下发日</label>
              <input name="grantedAt" type="date" defaultValue={p.grantedAt} required className={`${inputCls} f-mono`} />
            </div>
            <div>
              <label className={labelCls}>数量</label>
              <input name="quantity" type="number" step="any" min="0.01" defaultValue={p.quantity} required className={`${inputCls} w-24`} />
            </div>
            <div>
              <label className={labelCls}>到期日</label>
              <input name="expiresAt" type="date" defaultValue={p.expiresAt} required className={`${inputCls} f-mono`} />
            </div>
            <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
              保存
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface"
            >
              取消
            </button>
          </form>
        ) : (
          <div key={p.id} className="group flex items-center justify-between border-b border-line py-2 last:border-0">
            <div className="text-[12px] f-mono">
              <span className="font-semibold tabular-nums">{p.quantity} {usageUnit ?? ""}</span>
              <span className="ml-2 text-muted">{p.grantedAt} 发 → {p.expiresAt} 到期</span>
            </div>
            {isOwner && (
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setEditingId(p.id)}
                  className="invisible border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-ink hover:text-surface"
                >
                  编辑
                </button>
                <button
                  onClick={async () => deletePackAction(subscriptionId, p.id)}
                  className="invisible border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase text-destructive f-mono group-hover:visible hover:bg-destructive hover:text-white"
                >
                  删除
                </button>
              </span>
            )}
          </div>
        ),
      )}

      {/* AUTO 只读列表（生成器读时对齐；手动模式永不生成） */}
      <div className="mt-3 border-t border-dashed border-line-strong pt-2">
        <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase text-faint f-mono">
          <Led color="#d4d4d4" /> 自动包（随周期生成，只读）
        </div>
        {auto.length === 0 ? (
          <div className="text-[10px] text-faint f-mono">无 — 手动模式不生成自动包，周期模式订阅由系统按周期对齐</div>
        ) : (
          auto.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1.5 text-[12px] f-mono text-muted">
              <span className="tabular-nums">{p.quantity} {usageUnit ?? ""}</span>
              <span>{p.grantedAt} 发 → {p.expiresAt} 到期</span>
            </div>
          ))
        )}
        {nextGrant && (
          <div className="mt-1 flex items-center justify-between border-t border-dashed border-line py-1.5 text-[11px] f-mono text-faint">
            <span>下期将下发 +{nextGrant.quantity} {usageUnit ?? ""}</span>
            <span>{nextGrant.date}</span>
          </div>
        )}
      </div>
    </div>
  );
}
