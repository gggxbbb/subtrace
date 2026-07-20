"use client";

import { useState } from "react";
import { isoDay } from "@/lib/dates";
import { useSearchParams } from "next/navigation";
import { createSubscriptionAction } from "@/lib/subscriptions/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export default function NewSubscriptionPage() {
  const [mode, setMode] = useState<"CYCLE" | "MANUAL">("CYCLE");
  const [cycleKind, setCycleKind] = useState<"CALENDAR" | "FIXED_DAYS">("CALENDAR");
  const error = useSearchParams().get("error");
  const today = isoDay(new Date());

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <div className="mb-1 text-[9px] uppercase tracking-[0.25em] text-neutral-500 f-mono">
        subscriptions / new
      </div>
      <h1 className="mb-5 text-xl font-bold uppercase tracking-tight">新建订阅</h1>
      {error && (
        <div className="mb-4 border border-black bg-[#FF5A00] px-3 py-2 text-[11px] uppercase text-white f-mono">
          创建失败：请检查必填项（周期模式需要完整周期与标准价）
        </div>
      )}
      <form action={createSubscriptionAction} className="space-y-4 border border-black bg-white p-5">
        <input type="hidden" name="trackingMode" value={mode} />
        <input type="hidden" name="cycleKind" value={cycleKind} />

        <div>
          <label className={labelCls}>名称</label>
          <input name="name" required placeholder="哔哩哔哩大会员" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>分类（可选）</label>
          <input name="category" placeholder="视频 / 工具 / 健康…" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>跟踪模式</label>
          <div className="grid grid-cols-2 gap-px border border-black bg-black">
            {(
              [
                ["CYCLE", "周期模式 · 推算到期"],
                ["MANUAL", "手动模式 · 只记付费"],
              ] as const
            ).map(([m, label]) => (
              <button
                type="button"
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 text-[11px] uppercase tracking-wider f-mono ${mode === m ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "CYCLE" && (
          <>
            <div>
              <label className={labelCls}>计费周期</label>
              <div className="grid grid-cols-2 gap-px border border-black bg-black">
                {(
                  [
                    ["CALENDAR", "日历周期"],
                    ["FIXED_DAYS", "固定天数"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setCycleKind(k)}
                    className={`px-3 py-2 text-[11px] uppercase tracking-wider f-mono ${cycleKind === k ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {cycleKind === "CALENDAR" ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>每</label>
                  <input name="cycleCount" type="number" min="1" defaultValue="1" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>单位</label>
                  <select name="cycleUnit" defaultValue="MONTH" className={inputCls}>
                    <option value="DAY">日</option>
                    <option value="WEEK">周</option>
                    <option value="MONTH">月</option>
                    <option value="YEAR">年</option>
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className={labelCls}>每 N 天</label>
                <input name="fixedDays" type="number" min="1" placeholder="30" required className={inputCls} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>标准价</label>
                <input name="listPriceBase" type="number" step="0.01" min="0" placeholder="25.00" required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>币种</label>
                <input name="listCurrency" defaultValue="CNY" className={`${inputCls} f-mono`} />
              </div>
            </div>
            <input type="hidden" name="listPrice" value="" />
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" name="autoRenew" defaultChecked className="h-4 w-4 accent-black" />
              自动续费（到期自动扣款）
            </label>
          </>
        )}

        <div>
          <label className={labelCls}>起始日期</label>
          <input name="startDate" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
        </div>

        <div>
          <label className={labelCls}>提醒天数</label>
          <input name="remindDays" defaultValue="7,3,0" className={`${inputCls} f-mono`} />
          <p className="mt-1 text-[9px] uppercase text-neutral-400 f-mono">
            逗号分隔；到期前 N 天经通知渠道提醒 · 留空 = 不提醒
          </p>
        </div>

        {mode === "CYCLE" && (
        <div className="border border-black">
          <label className="flex items-center gap-2 border-b border-black bg-[#E4E3E0] px-3 py-2 text-[12px]">
            <input type="checkbox" name="firstPayment" defaultChecked className="h-4 w-4 accent-black" />
            <span>
              <strong>同时记一笔付费</strong>
              <span className="ml-1 text-[10px] text-neutral-500">推荐：到期日与成本立刻以实付为准，不再靠推算</span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3 p-3">
            <div>
              <label className={labelCls}>实付金额</label>
              <input name="firstAmount" type="number" step="0.01" min="0" placeholder="同标准价" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>来源</label>
              <select name="firstSource" defaultValue="AUTO" className={inputCls}>
                <option value="AUTO">自动扣费</option>
                <option value="MANUAL">手动续费</option>
                <option value="PROMO">活动价</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>支付日期</label>
              <input name="firstPaidAt" type="date" defaultValue={today} className={`${inputCls} f-mono`} />
            </div>
            <div>
              <label className={labelCls}>服务起</label>
              <input name="firstPeriodStart" type="date" defaultValue={today} className={`${inputCls} f-mono`} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>服务止（到期日）</label>
              <input name="firstPeriodEnd" type="date" className={`${inputCls} f-mono`} />
              <p className="mt-1 text-[9px] uppercase text-neutral-400 f-mono">
                留空 = 服务起 + 一个周期
              </p>
            </div>
          </div>
        </div>
        )}

        <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
          创建 →
        </button>
      </form>
    </div>
  );
}
