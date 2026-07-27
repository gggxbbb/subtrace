"use client";

// 汇率表管理（ticket 09）：主币种 + API 模板 + 币对表（AUTO/MANUAL、错误标记、删除）+ 立即刷新。

import { useState, useTransition } from "react";
import { Led } from "@/components/te";
import {
  deleteRateAction,
  refreshRatesAction,
  setBaseCurrencyAction,
  setRatesApiUrlAction,
  upsertRateAction,
} from "@/lib/exchange/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-3 py-2 text-sm outline-none focus:bg-white";
const labelCls = "mb-1 block text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export interface RateRow {
  id: string;
  currency: string;
  rateToBase: number;
  mode: string;
  lastError: string | null;
  updatedAt: string;
}

export function RatesPanel({
  baseCurrency,
  ratesApiUrl,
  rates,
}: {
  baseCurrency: string;
  ratesApiUrl: string;
  rates: RateRow[];
}) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"AUTO" | "MANUAL">("MANUAL");
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form action={(fd) => start(() => setBaseCurrencyAction(fd))} className="border border-black bg-white p-4">
          <label className={labelCls}>主币种（所有成本的计价单位）</label>
          <div className="flex gap-2">
            <input name="baseCurrency" defaultValue={baseCurrency} maxLength={3} className={`${inputCls} f-mono uppercase`} />
            <button disabled={pending} className="shrink-0 border border-black bg-black px-3 text-[10px] uppercase text-white f-mono hover:bg-[#FF6B00] disabled:opacity-40">
              保存
            </button>
          </div>
          <p className="mt-1.5 text-[9px] uppercase text-neutral-400 f-mono">改动只影响之后的录入预填，历史快照不变（ADR-0004）</p>
        </form>
        <form action={(fd) => start(() => setRatesApiUrlAction(fd))} className="border border-black bg-white p-4">
          <label className={labelCls}>汇率 API 模板（{"{base}"} 占位）</label>
          <div className="flex gap-2">
            <input name="ratesApiUrl" defaultValue={ratesApiUrl} placeholder="https://open.er-api.com/v6/latest/{base}" className={`${inputCls} f-mono`} />
            <button disabled={pending} className="shrink-0 border border-black bg-black px-3 text-[10px] uppercase text-white f-mono hover:bg-[#FF6B00] disabled:opacity-40">
              保存
            </button>
          </div>
          <p className="mt-1.5 text-[9px] uppercase text-neutral-400 f-mono">期望响应：{"{\"rates\": {\"主币种\": 数值}}"} · AUTO 币对每日自动刷新</p>
        </form>
      </div>

      <div className="border border-black bg-white">
        <div className="flex items-center justify-between border-b border-black px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] f-mono">
            <span className="text-neutral-400">03</span> — 币对 / {rates.length}
          </span>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setRefreshMsg(null);
                const r = await refreshRatesAction();
                setRefreshMsg(
                  r.failed.length > 0
                    ? `更新 ${r.updated} 个，失败 ${r.failed.length} 个（${r.failed.map((f) => f.currency).join("/")}）`
                    : `已更新 ${r.updated} 个 AUTO 币对`,
                );
              })
            }
            className="border border-black bg-white px-2.5 py-1 text-[9px] uppercase tracking-wider f-mono hover:bg-black hover:text-white disabled:opacity-40"
          >
            立即刷新 AUTO
          </button>
        </div>
        {refreshMsg && (
          <div className="border-b border-black bg-[#E4E3E0] px-4 py-1.5 text-[10px] f-mono">{refreshMsg}</div>
        )}
        {rates.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] uppercase text-neutral-400 f-mono">
            还没有币对，在下方添加
          </div>
        )}
        {rates.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2.5 last:border-0">
            <Led color={r.mode === "AUTO" ? (r.lastError ? "#ef4444" : "#22c55e") : "#d4d4d4"} />
            <span className="w-14 text-[13px] font-bold f-mono">{r.currency}</span>
            <span className="text-[13px] tabular-nums f-mono">1 {r.currency} = {r.rateToBase} {baseCurrency}</span>
            <span className="text-[9px] uppercase text-neutral-400 f-mono">{r.mode}</span>
            <span className="flex-1 text-right text-[10px] text-neutral-500 f-mono">
              {r.lastError ? (
                <span className="text-[#ef4444]">更新失败：{r.lastError}（保留旧值 {r.updatedAt}）</span>
              ) : (
                <>更新于 {r.updatedAt}</>
              )}
            </span>
            <button
              disabled={pending}
              onClick={() => start(() => deleteRateAction(r.id))}
              className="border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono text-[#ef4444] hover:bg-[#ef4444] hover:text-white disabled:opacity-40"
            >
              删除
            </button>
          </div>
        ))}
      </div>

      <div className="border border-black bg-white">
        <div className="border-b border-black px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] f-mono">
          <span className="text-neutral-400">04</span> — 添加币对
        </div>
        <form action={(fd) => start(() => upsertRateAction(fd))} className="flex items-end gap-3 p-4">
          <div className="w-28">
            <label className={labelCls}>原币</label>
            <input name="currency" required maxLength={3} placeholder="USD" className={`${inputCls} f-mono uppercase`} />
          </div>
          <div className="flex-1">
            <label className={labelCls}>1 原币 = N {baseCurrency}</label>
            <input name="rateToBase" required type="number" step="0.0001" min="0.0001" placeholder="7.25" className={`${inputCls} f-mono`} />
          </div>
          <div className="flex flex-col self-stretch">
            <label className={labelCls}>模式</label>
            <div className="flex flex-1 border border-black">
              {(["MANUAL", "AUTO"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex flex-1 items-center justify-center px-3 py-2 text-[10px] uppercase tracking-wider f-mono ${
                    mode === m ? "bg-black text-white" : "bg-white hover:bg-black/5"
                  }`}
                >
                  {m === "MANUAL" ? "手动钉住" : "自动更新"}
                </button>
              ))}
            </div>
            <input type="hidden" name="mode" value={mode} />
          </div>
          <button disabled={pending} className="h-[38px] shrink-0 border border-black bg-black px-4 text-[10px] uppercase tracking-wider text-white f-mono hover:bg-[#FF6B00] hover:border-[#FF6B00] disabled:opacity-40">
            添加
          </button>
        </form>
      </div>
    </div>
  );
}
