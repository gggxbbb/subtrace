"use client";

import { useState } from "react";
import { isoDay } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { inputCls, labelCls } from "@/components/te";
import {
  addQuotaSnapshotAction,
  addSavingsAction,
  addUsageAction,
  deleteUsageAction,
  updateUsageAction,
} from "@/lib/usage/actions";
import type { GrantMode } from "@/lib/usage/service";


export interface UsageRow {
  id: string;
  userId: string;
  userName: string;
  date: string;
  quantity: number;
  kind: string;
  unitPrice: number | null;
  quotaTotal: number | null;
}

const today = () => isoDay(new Date());

export function UsageRecordsManager({
  subscriptionId,
  usageKind,
  grantMode,
  usageUnit,
  rows,
  total,
  userOptions,
  filters,
  back,
  currentUserId,
  isOwner,
  currency,
}: {
  subscriptionId: string;
  usageKind: "COUNT" | "QUOTA" | "SAVINGS";
  /** 发放形态：空 = RESET | STACKED（包叠加只收剩余快照，ADR-0012） */
  grantMode: GrantMode | null;
  usageUnit: string | null;
  rows: UsageRow[];
  total: number;
  userOptions: { id: string; name: string }[];
  filters: { userId: string; kind: string; from: string; to: string };
  back: string;
  currentUserId: string;
  isOwner: boolean;
  currency: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const backInput = <input type="hidden" name="back" value={back} />;
  const canTouch = (r: UsageRow) => isOwner || r.userId === currentUserId;
  const stacked = usageKind === "QUOTA" && grantMode === "STACKED";

  return (
    <>
      <form method="GET" className="flex items-end gap-2 border border-ink bg-surface p-3">
        <div>
          <label className={labelCls}>受益人</label>
          <select name="userId" defaultValue={filters.userId} className={inputCls}>
            <option value="">全部</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        {usageKind !== "SAVINGS" && !stacked && (
          <div>
            <label className={labelCls}>类型</label>
            <select name="kind" defaultValue={filters.kind} className={inputCls}>
              <option value="">全部</option>
              <option value="DELTA">增量</option>
              <option value="TOTAL">快照</option>
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>从</label>
          <input name="from" type="date" defaultValue={filters.from} className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>到</label>
          <input name="to" type="date" defaultValue={filters.to} className={`${inputCls} f-mono`} />
        </div>
        <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
          筛选
        </button>
        <a href={`/subscriptions/${subscriptionId}/usage/records`} className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
          重置
        </a>
        <button type="button" onClick={() => setAdding(!adding)} className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
          {adding ? "收起" : "+ 记一笔"}
        </button>
      </form>

      {adding && usageKind === "SAVINGS" && (
        <form
          action={addSavingsAction.bind(null, subscriptionId)}
          className="flex items-end gap-2 border border-ink bg-surface p-3"
        >
          {backInput}
          <div>
            <label className={labelCls}>日期</label>
            <input name="date" type="date" defaultValue={today()} required className={`${inputCls} f-mono`} />
          </div>
          <div>
            <label className={labelCls}>本次已省</label>
            <input name="amount" type="number" step="0.01" min="0.01" required className={inputCls} />
          </div>
          <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
            保存 →
          </button>
        </form>
      )}

      {adding && stacked && (
        <form
          action={addQuotaSnapshotAction.bind(null, subscriptionId)}
          className="flex items-end gap-2 border border-ink bg-surface p-3"
        >
          {backInput}
          <div>
            <label className={labelCls}>日期</label>
            <input name="date" type="date" defaultValue={today()} required className={`${inputCls} f-mono`} />
          </div>
          <div>
            <label className={labelCls}>剩余总量{usageUnit ? `（${usageUnit}）` : ""}</label>
            <input name="remaining" type="number" step="any" min="0" required className={inputCls} />
          </div>
          <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
            保存 →
          </button>
        </form>
      )}

      {adding && usageKind !== "SAVINGS" && !stacked && (
        <form
          action={(usageKind === "QUOTA" ? addQuotaSnapshotAction : addUsageAction).bind(null, subscriptionId)}
          className="flex items-end gap-2 border border-ink bg-surface p-3"
        >
          {backInput}
          <div>
            <label className={labelCls}>日期</label>
            <input name="date" type="date" defaultValue={today()} required className={`${inputCls} f-mono`} />
          </div>
          <div>
            <label className={labelCls}>{usageKind === "QUOTA" ? "使用到额度" : `用量（${usageUnit ?? "次"}）`}</label>
            <input name={usageKind === "QUOTA" ? "used" : "quantity"} type="number" step="any" min="0" required className={inputCls} />
          </div>
          {usageKind === "COUNT" && (
            <div>
              <label className={labelCls}>本次单价</label>
              <input name="unitPrice" type="number" step="0.01" min="0" placeholder="继承默认" className={inputCls} />
            </div>
          )}
          {usageKind === "QUOTA" && (
            <div>
              <label className={labelCls}>当月总额度</label>
              <input name="quotaTotal" type="number" step="any" min="0.01" placeholder="继承默认" className={inputCls} />
            </div>
          )}
          <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
            保存 →
          </button>
        </form>
      )}

      <div className="text-[10px] uppercase text-faint f-mono">
        {rows.length} / {total} 条
      </div>

      <div className="border border-ink bg-surface">
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] uppercase text-faint f-mono">
            没有匹配的用量记录
          </div>
        )}
        {rows.map((r) =>
          editingId === r.id ? (
            <form key={r.id} action={updateUsageAction.bind(null, subscriptionId, r.id)} className="flex items-end gap-2 border-b border-ink bg-base px-4 py-3">
              {backInput}
              <div>
                <label className={labelCls}>日期</label>
                <input name="date" type="date" defaultValue={r.date} required className={`${inputCls} f-mono`} />
              </div>
              <div>
                <label className={labelCls}>{usageKind === "SAVINGS" ? "已省金额" : stacked ? "剩余" : "数量"}</label>
                <input name="quantity" type="number" step="any" min="0" defaultValue={r.quantity} required className={inputCls} />
              </div>
              {usageKind !== "SAVINGS" && !stacked && (
                <>
                  <div>
                    <label className={labelCls}>单价</label>
                    <input name="unitPrice" type="number" step="0.01" min="0" defaultValue={r.unitPrice ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>总额度</label>
                    <input name="quotaTotal" type="number" step="any" min="0.01" defaultValue={r.quotaTotal ?? ""} className={inputCls} />
                  </div>
                </>
              )}
              <button className="bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover">
                保存
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="border border-ink bg-surface px-3 py-1.5 text-[11px] uppercase hover:bg-ink hover:text-surface">
                取消
              </button>
            </form>
          ) : (
            <div key={r.id} className="group flex items-center justify-between border-b border-line px-4 py-2 last:border-0">
              <div className="text-[12px] f-mono">
                <span className="text-muted">{r.date}</span>
                <span className="ml-2 font-semibold">{r.userName}</span>
                <span className="ml-2">
                  {usageKind === "SAVINGS"
                    ? `+${fmtMoney(r.quantity, currency)}`
                    : stacked
                      ? `剩余 ${r.quantity} ${usageUnit ?? ""}`
                      : `${r.kind === "TOTAL" ? `已用 ${r.quantity}` : `+${r.quantity}`} ${usageUnit ?? ""}`}
                </span>
                {r.unitPrice != null && <span className="ml-1 text-faint">@ {r.unitPrice}</span>}
                {r.quotaTotal != null && <span className="ml-1 text-faint">/ {r.quotaTotal}</span>}
              </div>
              {canTouch(r) && (
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(r.id)}
                    className="invisible border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-ink hover:text-surface"
                  >
                    编辑
                  </button>
                  <button
                    onClick={async () => deleteUsageAction(subscriptionId, r.id, back)}
                    className="invisible border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase text-destructive f-mono group-hover:visible hover:bg-destructive hover:text-white"
                  >
                    删除
                  </button>
                </span>
              )}
            </div>
          ),
        )}
      </div>
    </>
  );
}
