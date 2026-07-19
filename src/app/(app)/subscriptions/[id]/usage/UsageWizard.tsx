"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Led } from "@/components/te";
import { setUsageConfigAction, disableUsageAction, purgeUsageAction } from "@/lib/usage/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

type Kind = "COUNT" | "QUOTA";

/** 用量跟踪向导：概念讲解 → 选类型 → 字段配置 → 保存 */
export function UsageWizard({
  subscriptionId,
  initialKind,
  initialUnit,
  initialAltUnitPrice,
  initialQuotaTotal,
  recordCount,
}: {
  subscriptionId: string;
  initialKind: Kind | null;
  initialUnit: string | null;
  initialAltUnitPrice: number | null;
  initialQuotaTotal: number | null;
  /** 已有用量记录条数（用于重设警告） */
  recordCount: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // 已启用时先显示警告屏，确认后才进入向导
  const [acknowledged, setAcknowledged] = useState(initialKind === null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [kind, setKind] = useState<Kind>(initialKind ?? "COUNT");
  const [unit, setUnit] = useState(initialUnit ?? "");
  const [altUnitPrice, setAltUnitPrice] = useState(initialAltUnitPrice?.toString() ?? "");
  const [quotaTotal, setQuotaTotal] = useState(initialQuotaTotal?.toString() ?? "");

  const steps = ["概念", "类型", "字段", "确认"];

  if (!acknowledged) {
    return (
      <div className="border border-black bg-white">
        <div className="border-b border-black bg-[#E4E3E0] px-4 py-2 text-[10px] uppercase tracking-wider f-mono">
          已启用 · 重新设置
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Led color="#ef4444" /> 这个订阅已经在跟踪用量
          </div>
          <div className="border border-black">
            {(
              [
                ["当前类型", initialKind === "COUNT" ? "计数型" : "额度型"],
                ["单位", initialUnit ?? "（未填）"],
                ...(initialKind === "COUNT"
                  ? [["替代单价", initialAltUnitPrice != null ? `¥${initialAltUnitPrice}` : "（未填）"]]
                  : [["每月总额度", initialQuotaTotal != null ? `${initialQuotaTotal}` : "（未填）"]]),
                ["已有记录", `${recordCount} 条`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-black px-3 py-2 text-[12px] last:border-b-0">
                <span className="text-neutral-500">{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
          </div>
          <div className="border border-red-700 bg-red-50 p-3 text-[11px] leading-relaxed text-red-800">
            <strong>注意：</strong>修改字段（单位/单价/总额度）只影响后续计算口径，历史记录保持不变；
            但<strong>切换类型</strong>会让已有的 {recordCount} 条记录按新类型解读（增量 ↔ 快照），历史区间的盈亏可能失真。
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <form action={disableUsageAction.bind(null, subscriptionId)}>
                <button className="border border-red-700 bg-white px-3 py-1.5 text-[10px] uppercase tracking-wider text-red-700 hover:bg-red-700 hover:text-white">
                  停用跟踪（记录保留）
                </button>
              </form>
              {confirmPurge ? (
                <form action={purgeUsageAction.bind(null, subscriptionId)} className="flex gap-1">
                  <button className="bg-red-700 px-3 py-1.5 text-[10px] uppercase tracking-wider text-white hover:bg-red-800">
                    确认删除 {recordCount} 条记录？
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPurge(false)}
                    className="border border-black bg-white px-2 py-1.5 text-[10px] uppercase hover:bg-black hover:text-white"
                  >
                    算了
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmPurge(true)}
                  className="border border-red-700 bg-red-700 px-3 py-1.5 text-[10px] uppercase tracking-wider text-white hover:bg-red-800"
                >
                  停用并清除记录
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push(`/subscriptions/${subscriptionId}`)}
                className="border border-black bg-white px-4 py-1.5 text-[11px] uppercase tracking-wider hover:bg-black hover:text-white"
              >
                返回
              </button>
              <button
                type="button"
                onClick={() => setAcknowledged(true)}
                className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
              >
                我已了解，继续修改 →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-black bg-white">
      {/* 步骤条 */}
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

      <div className="p-5">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">用量跟踪回答一个问题：这钱花得值不值？</h2>
            <p className="text-[12px] leading-relaxed text-neutral-600">
              订阅的成本系统已经在算了（实付金额按服务天数摊销）。用量跟踪在此基础上记录你<strong>实际用了多少</strong>，
              两相对比得出盈亏。按订阅的性质，有两种追踪方式：
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-black p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                  <Led color="#FF5A00" /> 计数型
                </div>
                <p className="text-[11px] leading-relaxed text-neutral-600">
                  适合<strong>按次消费、单次有明确市场价</strong>的订阅：健身房（单次卡 ¥30）、按摩、洗车、私教课。
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600">
                  每用一次记一笔，系统拿「次数 × 市场价」对比已摊成本，回答<strong>“再去几次回本”</strong>。
                </p>
              </div>
              <div className="border border-black p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                  <Led color="#0ea5e9" /> 额度型
                </div>
                <p className="text-[11px] leading-relaxed text-neutral-600">
                  适合<strong>每月给固定额度</strong>的订阅：流量机场（1000GB）、iCloud（2TB）、API 点数包。
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600">
                  不定期同步一下“已用多少”，系统只看<strong>使用率</strong>：有没有用到 100%、什么时候用满；
                  没用完的部分按比例折算成浪费的钱。
                </p>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400">
              不启用也可以——用量跟踪是可选项，纯看成本的订阅不用开。
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">这个订阅属于哪一种？</h2>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ["COUNT", "计数型", "按次使用，单次有市场价", "健身房 · 按摩 · 洗车 · 私教课", "#FF5A00"],
                  ["QUOTA", "额度型", "每月固定额度，看使用率", "流量机场 · iCloud · API 点数", "#0ea5e9"],
                ] as const
              ).map(([k, title, desc, examples, color]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`border p-4 text-left transition-colors ${
                    kind === k ? "border-black bg-[#E4E3E0]" : "border-neutral-300 bg-white hover:border-black"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                    <Led color={color} /> {title}
                    {kind === k && <span className="ml-auto">✓</span>}
                  </div>
                  <div className="text-[11px] text-neutral-600">{desc}</div>
                  <div className="mt-1 text-[10px] text-neutral-400 f-mono">{examples}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">{kind === "COUNT" ? "计数型字段" : "额度型字段"}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>用量单位</label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder={kind === "COUNT" ? "次 / 小时 / 节" : "GB / 点数 / 条"}
                  className={inputCls}
                />
                <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">
                  展示用，比如“9 次”“800 GB”。
                </p>
              </div>
              {kind === "COUNT" ? (
                <div>
                  <label className={labelCls}>替代单价（市场价）</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={altUnitPrice}
                    onChange={(e) => setAltUnitPrice(e.target.value)}
                    placeholder="30"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">
                    不买这个订阅、按次单买要花多少钱一次（如健身房单次卡 ¥30）。
                    盈亏 = 次数 × 这个价 − 已摊成本。每次录入时还能临时改“本次单价”（涨价、不同项目）。
                  </p>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>每月总额度</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={quotaTotal}
                    onChange={(e) => setQuotaTotal(e.target.value)}
                    placeholder="1000"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">
                    套餐每月给的总量（如 1000 GB）。录入时每次还能改（运营商偷偷加量减量都接得住）。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">确认</h2>
            <div className="border border-black">
              {(
                [
                  ["类型", kind === "COUNT" ? "计数型（按次算回本）" : "额度型（看使用率）"],
                  ["单位", unit || "（未填）"],
                  ...(kind === "COUNT"
                    ? [["替代单价", altUnitPrice ? `¥${altUnitPrice} / ${unit || "次"}` : "（未填）"]]
                    : [["每月总额度", quotaTotal ? `${quotaTotal} ${unit || ""}` : "（未填）"]]),
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-black px-3 py-2 text-[12px] last:border-b-0">
                  <span className="text-neutral-500">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400">
              保存后详情页会出现「用量录入」和「盈亏 · 当前区间」两张卡片。
            </p>
            <form action={setUsageConfigAction.bind(null, subscriptionId)}>
              <input type="hidden" name="usageKind" value={kind} />
              <input type="hidden" name="usageUnit" value={unit} />
              {kind === "COUNT" && <input type="hidden" name="altUnitPrice" value={altUnitPrice} />}
              {kind === "QUOTA" && <input type="hidden" name="quotaTotal" value={quotaTotal} />}
              <button className="w-full bg-black py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800">
                启用用量跟踪 →
              </button>
            </form>
          </div>
        )}

        {/* 底部导航 */}
        <div className="mt-5 flex justify-between border-t border-dashed border-neutral-300 pt-3">
          <button
            type="button"
            onClick={() => (step === 0 ? router.push(`/subscriptions/${subscriptionId}`) : setStep(step - 1))}
            className="border border-black bg-white px-4 py-1.5 text-[11px] uppercase tracking-wider hover:bg-black hover:text-white"
          >
            ← {step === 0 ? "返回" : "上一步"}
          </button>
          {step < 3 && (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && kind === "QUOTA" && !quotaTotal}
              className="bg-black px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              下一步 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
