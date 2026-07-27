"use client";

// 新建订阅四步向导（ui-polish 04）：基本信息 → 模式与周期 → 首笔与提醒 → 确认。
// 所有步骤挂在同一 <form> 内（非当前步 CSS 隐藏），提交字段与原单页表单一致；
// 手动模式下周期/价格与首笔付费块不渲染，字段不进 FormData。
// 逐步校验为轻量前置，服务端校验（?error=1）为最终兜底。

import { useRef, useState } from "react";
import { isoDay } from "@/lib/dates";
import { useSearchParams } from "next/navigation";
import { createSubscriptionAction } from "@/lib/subscriptions/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

const CYCLE_UNIT_LABEL: Record<string, string> = { DAY: "日", WEEK: "周", MONTH: "月", YEAR: "年" };

export default function NewSubscriptionPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [mode, setMode] = useState<"CYCLE" | "MANUAL">("CYCLE");
  const [cycleKind, setCycleKind] = useState<"CALENDAR" | "FIXED_DAYS">("CALENDAR");
  const [summary, setSummary] = useState<[string, string][]>([]);
  const error = useSearchParams().get("error");
  const today = isoDay(new Date());

  const steps = ["基本信息", "模式与周期", "首笔与提醒", "确认"];

  const field = (name: string) => {
    const el = formRef.current?.elements.namedItem(name);
    return el && "value" in el ? String(el.value) : "";
  };

  /** 进入下一步前的逐步校验；进入确认步时采集摘要 */
  const next = () => {
    if (step === 0 && !field("name").trim()) {
      setStepError("名称必填");
      return;
    }
    if (step === 1 && mode === "CYCLE") {
      const cycleOk =
        cycleKind === "CALENDAR" ? Number(field("cycleCount")) >= 1 : Number(field("fixedDays")) >= 1;
      if (!cycleOk || !field("listPriceBase").trim()) {
        setStepError("周期模式需要完整周期与标准价");
        return;
      }
    }
    setStepError(null);
    if (step === 2) {
      const rows: [string, string][] = [
        ["名称", field("name")],
        ["分类", field("category") || "—"],
        ["起始日期", field("startDate")],
        ["跟踪模式", mode === "CYCLE" ? "周期模式 · 推算到期" : "手动模式 · 只记付费"],
      ];
      if (mode === "CYCLE") {
        rows.push([
          "计费周期",
          cycleKind === "CALENDAR"
            ? `每 ${field("cycleCount") || "1"} ${CYCLE_UNIT_LABEL[field("cycleUnit")] ?? field("cycleUnit")}`
            : `每 ${field("fixedDays")} 天`,
        ]);
        rows.push(["标准价", `${field("listPriceBase")} ${field("listCurrency") || "CNY"}`]);
        rows.push(["自动续费", formRef.current?.elements.namedItem("autoRenew") && (formRef.current.elements.namedItem("autoRenew") as HTMLInputElement).checked ? "是" : "否"]);
        const firstOn = (formRef.current?.elements.namedItem("firstPayment") as HTMLInputElement | null)?.checked;
        rows.push([
          "首笔付费",
          firstOn
            ? `${field("firstAmount") || "同标准价"} · ${field("firstPeriodStart") || field("startDate")} → ${field("firstPeriodEnd") || "服务起 + 一个周期"}`
            : "不记",
        ]);
      }
      rows.push(["提醒天数", field("remindDays") || "不提醒"]);
      setSummary(rows);
    }
    setStep(step + 1);
  };

  const back = () => {
    setStepError(null);
    setStep(step - 1);
  };

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

      <div className="border border-black bg-white">
        {/* 步骤条（同用量跟踪向导） */}
        <div className="flex border-b border-black">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[10px] uppercase tracking-wider f-mono ${
                i === step ? "bg-black text-white" : i < step ? "bg-[#E4E3E0]" : "bg-white text-neutral-400"
              }`}
            >
              <span>{i + 1}</span> {s}
            </div>
          ))}
        </div>

        <form ref={formRef} action={createSubscriptionAction}>
          <input type="hidden" name="trackingMode" value={mode} />
          <input type="hidden" name="cycleKind" value={cycleKind} />

          {/* 步骤 1：基本信息 */}
          <div className={`space-y-4 p-5 ${step === 0 ? "" : "hidden"}`}>
            <div>
              <label className={labelCls}>名称</label>
              <input name="name" required placeholder="哔哩哔哩大会员" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>分类（可选）</label>
              <input name="category" placeholder="视频 / 工具 / 健康…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>起始日期</label>
              <input name="startDate" type="date" defaultValue={today} required className={`${inputCls} f-mono`} />
            </div>
          </div>

          {/* 步骤 2：模式与周期 */}
          <div className={`space-y-4 p-5 ${step === 1 ? "" : "hidden"}`}>
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
            {mode === "MANUAL" && (
              <p className="text-[11px] leading-relaxed text-neutral-500">
                手动模式不维护周期与标准价：到期日完全由之后登记的每笔付费记录决定。
              </p>
            )}
          </div>

          {/* 步骤 3：首笔与提醒 */}
          <div className={`space-y-4 p-5 ${step === 2 ? "" : "hidden"}`}>
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
            <div>
              <label className={labelCls}>提醒天数</label>
              <input name="remindDays" defaultValue="7,3,0" className={`${inputCls} f-mono`} />
              <p className="mt-1 text-[9px] uppercase text-neutral-400 f-mono">
                逗号分隔；到期前 N 天经通知渠道提醒 · 留空 = 不提醒
              </p>
            </div>
          </div>

          {/* 步骤 4：确认 */}
          <div className={`space-y-4 p-5 ${step === 3 ? "" : "hidden"}`}>
            <div className="border border-black">
              {summary.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-black px-3 py-2 text-[12px] last:border-b-0">
                  <span className="shrink-0 text-neutral-500">{k}</span>
                  <span className="min-w-0 truncate font-semibold" title={v}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 底部导航 */}
          <div className="flex items-center justify-between border-t border-black px-5 py-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={back}
                className="border border-black bg-white px-4 py-1.5 text-[11px] uppercase tracking-wider hover:bg-black hover:text-white"
              >
                ← 上一步
              </button>
            ) : (
              <span />
            )}
            {stepError && <span className="text-[11px] text-red-700 f-mono">{stepError}</span>}
            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
              >
                下一步 →
              </button>
            ) : (
              <button
                type="submit"
                formNoValidate
                className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
              >
                创建 →
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
