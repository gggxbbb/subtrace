"use client";

import { useState } from "react";
import { isoDay } from "@/lib/dates";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createBundleAction } from "@/lib/bundles/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

const fmtMoney = (n: number) => `¥${n.toFixed(2)}`;

export interface Item {
  mode: "existing" | "new";
  subscriptionId: string;
  newName: string;
  listPriceBase: string;
  allocatedBase: string; // 空 = 按比例
  periodStart: string;
  periodEnd: string;
  plusDays: string;
  /** 用户手动改过起止后，不再随打包日期联动 */
  periodTouched: boolean;
}

export const newItem = (start: string, end: string): Item => ({
  mode: "new",
  subscriptionId: "",
  newName: "",
  listPriceBase: "",
  allocatedBase: "",
  periodStart: start,
  periodEnd: end,
  plusDays: "",
  periodTouched: false,
});

export interface BundleWizardInitial {
  name: string;
  totalAmount: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  items: Item[];
}

export function BundleWizard({
  existingSubs,
  initial,
  action,
  submitLabel = "创建联合会员 →",
}: {
  existingSubs: { id: string; name: string; expiry: string | null }[];
  /** 编辑模式：预填数据（子会员全部按「关联已有」呈现） */
  initial?: BundleWizardInitial;
  /** 自定义提交 action（编辑模式用 replaceBundleAction） */
  action?: (formData: FormData) => Promise<void>;
  submitLabel?: string;
}) {
  const error = useSearchParams().get("error");
  const today = isoDay(new Date());
  const nextYear = isoDay(new Date(Date.now() + 365 * 86_400_000));
  const [items, setItems] = useState<Item[]>(initial?.items ?? [newItem(today, nextYear)]);
  const [total, setTotal] = useState(initial?.totalAmount ?? "");

  const totalNum = Number(total) || 0;
  const priceSum = items.reduce((s, it) => s + (Number(it.listPriceBase) || 0), 0);
  const autoAlloc = (it: Item) =>
    priceSum > 0 ? (totalNum * (Number(it.listPriceBase) || 0)) / priceSum : 0;

  const update = (i: number, patch: Partial<Item>) =>
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const [bundleStart, setBundleStartRaw] = useState(initial?.periodStart ?? today);
  const [bundleEnd, setBundleEndRaw] = useState(initial?.periodEnd ?? nextYear);
  const [bundlePlusDays, setBundlePlusDays] = useState("");

  // 打包日期改动时，未手动改过起止的行跟着联动
  const setBundleStart = (v: string) => {
    setBundleStartRaw(v);
    setItems((prev) => prev.map((it) => (it.periodTouched ? it : { ...it, periodStart: v })));
  };
  const setBundleEnd = (v: string) => {
    setBundleEndRaw(v);
    setItems((prev) => prev.map((it) => (it.periodTouched ? it : { ...it, periodEnd: v })));
  };

  const applyBundlePlusDays = (v: string) => {
    setBundlePlusDays(v);
    const n = Number(v);
    if (Number.isFinite(n) && v.trim() !== "" && bundleStart) {
      setBundleEnd(
        isoDay(new Date(new Date(`${bundleStart}T00:00:00+08:00`).getTime() + n * 86_400_000)),
      );
    }
  };

  const applyPlusDays = (i: number, v: string) => {
    const it = items[i];
    const n = Number(v);
    const patch: Partial<Item> = { plusDays: v, periodTouched: true };
    if (Number.isFinite(n) && v.trim() !== "" && it.periodStart) {
      patch.periodEnd = isoDay(
        new Date(new Date(`${it.periodStart}T00:00:00+08:00`).getTime() + n * 86_400_000),
      );
    }
    update(i, patch);
  };

  return (
    <form action={action ?? createBundleAction} className="space-y-4 border border-black bg-white p-5">
      {error && (
        <div className="border border-black bg-[#FF5A00] px-3 py-2 text-[11px] uppercase text-white f-mono">
          创建失败：请检查打包信息与子会员
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>联合会员名称</label>
          <input name="name" required defaultValue={initial?.name} placeholder="88VIP 联名" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>打包实付</label>
          <div className="flex gap-2">
            <input
              name="totalAmount"
              type="number"
              step="0.01"
              min="0"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={inputCls}
            />
            <input name="currency" defaultValue={initial?.currency ?? "CNY"} className={`${inputCls} w-20 f-mono`} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>权益起</label>
          <input name="periodStart" type="date" value={bundleStart} onChange={(e) => setBundleStart(e.target.value)} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>权益止</label>
          <div className="flex border border-black bg-[#E4E3E0] focus-within:bg-white">
            <input
              name="periodEnd"
              type="date"
              value={bundleEnd}
              onChange={(e) => {
                setBundleEnd(e.target.value);
                setBundlePlusDays("");
              }}
              required
              className="w-full bg-transparent px-2 py-1.5 text-sm outline-none f-mono"
            />
            <span className="flex items-center border-l border-black px-2 text-sm text-neutral-500 f-mono">
              +
            </span>
            <input
              type="number"
              min="1"
              placeholder="N 天"
              value={bundlePlusDays}
              onChange={(e) => applyBundlePlusDays(e.target.value)}
              className="w-20 shrink-0 bg-transparent px-1 py-1.5 text-sm outline-none f-mono"
              title="权益止 = 权益起 + N 天"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={`${labelCls} mb-0`}>子会员（分摊打包价）</label>
          <button
            type="button"
            onClick={() => setItems([...items, newItem(bundleStart, bundleEnd)])}
            className="flex items-center gap-1 border border-black bg-white px-2 py-1 text-[10px] uppercase f-mono hover:bg-black hover:text-white"
          >
            <Plus className="h-3 w-3" /> 添加
          </button>
        </div>
        <div className="space-y-px border border-black bg-black">
          {items.map((it, i) => (
            <div key={i} className="space-y-3 bg-white px-3 py-3">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex gap-2 text-[9px] uppercase f-mono">
                    <button
                      type="button"
                      onClick={() => update(i, { mode: "new" })}
                      className={it.mode === "new" ? "font-bold underline" : "text-neutral-400"}
                    >
                      新建
                    </button>
                    <button
                      type="button"
                      onClick={() => update(i, { mode: "existing" })}
                      className={it.mode === "existing" ? "font-bold underline" : "text-neutral-400"}
                    >
                      关联已有
                    </button>
                  </div>
                  {it.mode === "new" ? (
                    <input
                      placeholder="子会员名称，如 优酷 VIP"
                      value={it.newName}
                      onChange={(e) => update(i, { newName: e.target.value })}
                      className={inputCls}
                    />
                  ) : (
                    <select
                      value={it.subscriptionId}
                      onChange={(e) => {
                        const sub = existingSubs.find((s) => s.id === e.target.value);
                        update(i, {
                          subscriptionId: e.target.value,
                          // 顺延心智：服务起预填该订阅当前到期日（排他日，无缝衔接）
                          periodStart: sub?.expiry ?? it.periodStart,
                          periodEnd: "",
                          plusDays: "",
                          periodTouched: true,
                        });
                      }}
                      className={inputCls}
                    >
                      <option value="">选择已有订阅…</option>
                      {existingSubs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.expiry ? `（到期 ${s.expiry}）` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  className="p-2 text-neutral-400 hover:text-red-700"
                  disabled={items.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>单买原价</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="未知"
                    value={it.listPriceBase}
                    onChange={(e) => update(i, { listPriceBase: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>按比例 ≈</label>
                  <div className="border border-dashed border-neutral-400 px-2 py-1.5 text-sm f-mono">
                    {fmtMoney(autoAlloc(it))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>分摊额（可改）</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={autoAlloc(it).toFixed(2)}
                    value={it.allocatedBase}
                    onChange={(e) => update(i, { allocatedBase: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>服务起</label>
                  <input
                    type="date"
                    value={it.periodStart}
                    onChange={(e) => update(i, { periodStart: e.target.value, periodTouched: true })}
                    className={`${inputCls} f-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>服务止</label>
                  <div className="flex border border-black bg-[#E4E3E0] focus-within:bg-white">
                    <input
                      type="date"
                      value={it.periodEnd}
                      onChange={(e) => update(i, { periodEnd: e.target.value, plusDays: "", periodTouched: true })}
                      className="w-full bg-transparent px-2 py-1.5 text-sm outline-none f-mono"
                    />
                    <span className="flex items-center border-l border-black px-2 text-sm text-neutral-500 f-mono">
                      +
                    </span>
                    <input
                      type="number"
                      min="1"
                      placeholder="N 天"
                      value={it.plusDays}
                      onChange={(e) => applyPlusDays(i, e.target.value)}
                      className="w-20 shrink-0 bg-transparent px-1 py-1.5 text-sm outline-none f-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-[9px] uppercase text-neutral-400 f-mono">
          关联已有订阅时，分摊金额将作为联合会员付费记录追加到该订阅，历史连续
        </div>
      </div>

      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items.map((it) => ({
            subscriptionId: it.mode === "existing" ? it.subscriptionId : undefined,
            newName: it.mode === "new" ? it.newName : undefined,
            listPriceBase: it.listPriceBase === "" ? null : Number(it.listPriceBase),
            allocatedBase: it.allocatedBase === "" ? undefined : Number(it.allocatedBase),
            periodStart: it.periodStart,
            periodEnd: it.periodEnd,
          })),
        )}
      />
      <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
        {submitLabel}
      </button>
    </form>
  );
}
