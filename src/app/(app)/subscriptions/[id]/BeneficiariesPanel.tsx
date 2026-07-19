"use client";

import { useState } from "react";
import { Led } from "@/components/te";
import {
  addBeneficiaryAction,
  removeBeneficiaryAction,
  setBeneficiaryWeightAction,
} from "@/lib/beneficiaries/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";

export interface BeneficiaryRow {
  id: string;
  kind: "USER" | "ITEM";
  /** 显示名：用户名或物品名 */
  name: string;
  weight: number;
  share: number;
  isOwnerRow: boolean;
}

/** 受益实体面板：所有者增删改权重；受益用户只读 */
export function BeneficiariesPanel({
  subscriptionId,
  isOwner,
  rows,
  candidateUsers,
  candidateItems,
}: {
  subscriptionId: string;
  isOwner: boolean;
  rows: BeneficiaryRow[];
  candidateUsers: { id: string; username: string }[];
  candidateItems: { id: string; name: string }[];
}) {
  const [kind, setKind] = useState<"USER" | "ITEM">("USER");
  const candidates = kind === "USER" ? candidateUsers : candidateItems;

  if (rows.length === 0 && !isOwner) return null;

  return (
    <div className="px-4 py-4">
      {rows.length === 0 ? (
        <p className="mb-3 text-[11px] text-neutral-400">
          未配置分摊——所有者承担全部成本。添加受益人后按权重分摊（用户 = 家庭共享，物品 = iCloud 之于多设备）。
        </p>
      ) : (
        <div className="mb-3">
          <div className="grid grid-cols-[1fr_5rem_5rem_4rem] gap-2 border-b border-dashed border-neutral-300 pb-1 text-[9px] uppercase text-neutral-400 f-mono">
            <span>受益实体</span>
            <span className="text-right">权重</span>
            <span className="text-right">份额</span>
            <span />
          </div>
          {rows.map((r) => (
            <div key={r.id} className="group grid grid-cols-[1fr_5rem_5rem_4rem] items-center gap-2 border-b border-dashed border-neutral-200 py-1.5 text-[12px]">
              <span className="flex items-center gap-1.5">
                <Led color={r.kind === "USER" ? "#FF5A00" : "#0ea5e9"} />
                {r.name}
                <span className="text-[9px] uppercase text-neutral-400 f-mono">
                  {r.kind === "USER" ? "用户" : "物品"}
                  {r.isOwnerRow ? " · 所有者" : ""}
                </span>
              </span>
              {isOwner ? (
                <form action={setBeneficiaryWeightAction.bind(null, subscriptionId, r.id)} className="text-right">
                  <input
                    name="weight"
                    type="number"
                    step="any"
                    min="0.01"
                    defaultValue={r.weight}
                    className={`${inputCls} w-16 px-1 py-0.5 text-right text-[11px] f-mono`}
                  />
                </form>
              ) : (
                <span className="text-right f-mono">{r.weight}</span>
              )}
              <span className="text-right tabular-nums f-mono">{Math.round(r.share * 100)}%</span>
              <span className="text-right">
                {isOwner && (
                  <button
                    onClick={async () => removeBeneficiaryAction(subscriptionId, r.id)}
                    className="invisible text-red-700 group-hover:visible"
                  >
                    移除
                  </button>
                )}
              </span>
            </div>
          ))}
          <p className="mt-1.5 text-[9px] uppercase text-neutral-400 f-mono">
            份额 = 权重 / Σ权重 · 改权重立即全局重算 · 权重行内编辑回车生效
          </p>
        </div>
      )}

      {isOwner && (
        <form action={addBeneficiaryAction.bind(null, subscriptionId)} className="flex items-end gap-2">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">类型</div>
            <div className="grid grid-cols-2 gap-px border border-black bg-black">
              {(["USER", "ITEM"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-2 py-1.5 text-[10px] uppercase f-mono ${kind === k ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
                >
                  {k === "USER" ? "用户" : "物品"}
                </button>
              ))}
            </div>
          </div>
          <input type="hidden" name="kind" value={kind} />
          <div className="flex-1">
            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
              {kind === "USER" ? "选择用户" : "选择我的物品"}
            </div>
            <select name="refId" required className={inputCls}>
              <option value="">—</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {"username" in c ? c.username : c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-16">
            <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">权重</div>
            <input name="weight" type="number" step="any" min="0.01" defaultValue="1" className={inputCls} />
          </div>
          <button className="bg-black px-3 py-1.5 text-[11px] font-semibold uppercase text-white hover:bg-neutral-800">
            添加 →
          </button>
        </form>
      )}
    </div>
  );
}
