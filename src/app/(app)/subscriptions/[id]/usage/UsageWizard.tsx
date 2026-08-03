"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Led, inputCls, labelCls } from "@/components/te";
import { StepBar } from "@/components/StepWizard";
import { fmtMoney } from "@/lib/format";
import { setUsageConfigAction, disableUsageAction, purgeUsageAction } from "@/lib/usage/actions";


type Kind = "COUNT" | "QUOTA" | "SAVINGS";
type GrantMode = "RESET" | "STACKED";

const KIND_LABEL: Record<Kind, string> = { COUNT: "计数型", QUOTA: "额度型", SAVINGS: "省钱型" };
const MODE_LABEL: Record<GrantMode, string> = { RESET: "周期重置", STACKED: "包叠加" };

/** 用量跟踪向导：概念讲解 → 选类型 →（额度型）选发放形态 → 字段配置 → 保存 */
export function UsageWizard({
  subscriptionId,
  initialKind,
  initialGrantMode,
  initialPackValidMonths,
  initialUnit,
  initialAltUnitPrice,
  initialQuotaTotal,
  trackingMode,
  recordCount,
  currency,
}: {
  subscriptionId: string;
  initialKind: Kind | null;
  /** 发放形态（ADR-0012）：空 = RESET */
  initialGrantMode: GrantMode | null;
  initialPackValidMonths: number | null;
  initialUnit: string | null;
  initialAltUnitPrice: number | null;
  initialQuotaTotal: number | null;
  /** CYCLE | MANUAL：手动模式 + STACKED 无发放计划可推导，引导改周期模式 */
  trackingMode: string;
  /** 已有用量记录条数（用于重设警告） */
  recordCount: number;
  currency: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // 已启用时先显示警告屏，确认后才进入向导
  const [acknowledged, setAcknowledged] = useState(initialKind === null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [kind, setKind] = useState<Kind>(initialKind ?? "COUNT");
  const [grantMode, setGrantMode] = useState<GrantMode>(initialGrantMode ?? "RESET");
  const [packValidMonths, setPackValidMonths] = useState(initialPackValidMonths?.toString() ?? "12");
  const [unit, setUnit] = useState(initialUnit ?? "");
  const [altUnitPrice, setAltUnitPrice] = useState(initialAltUnitPrice?.toString() ?? "");
  const [quotaTotal, setQuotaTotal] = useState(initialQuotaTotal?.toString() ?? "");

  // 额度型多一步发放形态选择（周期重置 / 包叠加）
  const steps = kind === "QUOTA" ? ["概念", "类型", "形态", "字段", "确认"] : ["概念", "类型", "字段", "确认"];
  const cur = steps[Math.min(step, steps.length - 1)];
  const stackedCycle = kind === "QUOTA" && grantMode === "STACKED" && trackingMode === "CYCLE";
  const stackedManual = kind === "QUOTA" && grantMode === "STACKED" && trackingMode !== "CYCLE";
  // 形态切换警告（与类型切换同款：警告不禁止）
  const modeSwitched = initialKind === "QUOTA" && recordCount > 0 && grantMode !== (initialGrantMode ?? "RESET");

  if (!acknowledged) {
    return (
      <div className="border border-ink bg-surface">
        <div className="border-b border-ink bg-base px-4 py-2 text-[10px] uppercase tracking-wider f-mono">
          已启用 · 重新设置
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Led color="#ef4444" /> 这个订阅已经在跟踪用量
          </div>
            <div className="border border-ink">
            {(
              [
                ["当前类型", KIND_LABEL[initialKind ?? "COUNT"]],
                ...(initialKind === "QUOTA" ? [["发放形态", MODE_LABEL[initialGrantMode ?? "RESET"]]] : []),
                ...(initialKind !== "SAVINGS" ? [["单位", initialUnit ?? "（未填）"]] : []),
                ...(initialKind === "COUNT"
                  ? [["替代单价", initialAltUnitPrice != null ? fmtMoney(initialAltUnitPrice, currency) : "（未填）"]]
                  : initialKind === "QUOTA"
                    ? [["每月总额度", initialQuotaTotal != null ? `${initialQuotaTotal}` : "（未填）"]]
                    : []),
                ["已有记录", `${recordCount} 条`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-ink px-3 py-2 text-[12px] last:border-b-0">
                <span className="text-muted">{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
          </div>
          <div className="border border-destructive bg-destructive-band p-3 text-[11px] leading-relaxed text-destructive-strong">
            <strong>注意：</strong>修改字段（单位/单价/总额度）只影响后续计算口径，历史记录保持不变；
            但<strong>切换类型</strong>会让已有的 {recordCount} 条记录按新类型解读（增量 ↔ 快照），历史区间的盈亏可能失真；
            额度型<strong>切换发放形态</strong>同样会让历史快照按新语义解读（已用 ↔ 剩余）。
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <form action={disableUsageAction.bind(null, subscriptionId)}>
                <button className="border border-destructive bg-surface px-3 py-1.5 text-[10px] uppercase tracking-wider text-destructive hover:bg-destructive hover:text-white">
                  停用跟踪（记录保留）
                </button>
              </form>
              {confirmPurge ? (
                <form action={purgeUsageAction.bind(null, subscriptionId)} className="flex gap-1">
                  <button className="bg-destructive px-3 py-1.5 text-[10px] uppercase tracking-wider text-white hover:bg-destructive-hover">
                    确认删除 {recordCount} 条记录？
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPurge(false)}
                    className="border border-ink bg-surface px-2 py-1.5 text-[10px] uppercase hover:bg-ink hover:text-surface"
                  >
                    算了
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmPurge(true)}
                  className="border border-destructive bg-destructive px-3 py-1.5 text-[10px] uppercase tracking-wider text-white hover:bg-destructive-hover"
                >
                  停用并清除记录
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push(`/subscriptions/${subscriptionId}`)}
                className="border border-ink bg-surface px-4 py-1.5 text-[11px] uppercase tracking-wider hover:bg-ink hover:text-surface"
              >
                返回
              </button>
              <button
                type="button"
                onClick={() => setAcknowledged(true)}
                className="bg-ink px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover"
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
    <div className="border border-ink bg-surface">
      <StepBar steps={steps} step={step} />

      <div className="p-5">
        {cur === "概念" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">用量跟踪回答一个问题：这钱花得值不值？</h2>
            <p className="text-[12px] leading-relaxed text-muted-strong">
              订阅的成本系统已经在算了（实付金额按服务天数摊销）。用量跟踪在此基础上记录你<strong>实际用了多少</strong>，
              两相对比得出盈亏。按订阅的性质，有三种追踪方式：
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="border border-ink p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                  <Led color="var(--accent)" /> 计数型
                </div>
                <p className="text-[11px] leading-relaxed text-muted-strong">
                  适合<strong>按次消费、单次有明确市场价</strong>的订阅：健身房（单次卡 ¥30）、按摩、洗车、私教课。
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-strong">
                  每用一次记一笔，系统拿「次数 × 市场价」对比已摊成本，回答<strong>“再去几次回本”</strong>。
                </p>
              </div>
              <div className="border border-ink p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                  <Led color="#0ea5e9" /> 额度型
                </div>
                <p className="text-[11px] leading-relaxed text-muted-strong">
                  适合<strong>每月给固定额度</strong>的订阅：流量机场（1000GB）、iCloud（2TB）、API 点数包。
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-strong">
                  不定期同步一下“已用多少”，系统只看<strong>使用率</strong>：有没有用到 100%、什么时候用满；
                  没用完的部分按比例折算成浪费的钱。
                </p>
              </div>
              <div className="border border-ink p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                  <Led color="#22c55e" /> 省钱型
                </div>
                <p className="text-[11px] leading-relaxed text-muted-strong">
                  适合<strong>提供消费折扣</strong>的会员：京东 Plus、88VIP、盒马 X——平台会直接告诉你“当期已省”。
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-strong">
                  记下的就是<strong>省下的金额</strong>本身（逐笔记或照抄平台累计值），
                  系统拿「Σ已省 − 已摊成本」回答<strong>“回本没有”</strong>。
                </p>
              </div>
            </div>
            <p className="text-[11px] text-faint">
              不启用也可以——用量跟踪是可选项，纯看成本的订阅不用开。
            </p>
          </div>
        )}

        {cur === "类型" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">这个订阅属于哪一种？</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  ["COUNT", "计数型", "按次使用，单次有市场价", "健身房 · 按摩 · 洗车 · 私教课", "var(--accent)"],
                  ["QUOTA", "额度型", "每月固定额度，看使用率", "流量机场 · iCloud · API 点数", "#0ea5e9"],
                  ["SAVINGS", "省钱型", "消费折扣，记省下的金额", "京东 Plus · 88VIP · 盒马 X", "#22c55e"],
                ] as const
              ).map(([k, title, desc, examples, color]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`border p-4 text-left transition-colors ${
                    kind === k ? "border-ink bg-base" : "border-line-strong bg-surface hover:border-ink"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                    <Led color={color} /> {title}
                    {kind === k && <span className="ml-auto">✓</span>}
                  </div>
                  <div className="text-[11px] text-muted-strong">{desc}</div>
                  <div className="mt-1 text-[10px] text-faint f-mono">{examples}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {cur === "形态" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">额度怎么发？</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  ["RESET", "周期重置", "每个服务区间一份额度，区间末未用即浪费", "流量机场 · iCloud · 月度配额", "#0ea5e9"],
                  ["STACKED", "包叠加", "每期下发一个包，多包共存各自到期，停订全焚；只录剩余总量，系统 FEFO 推演浪费", "像素蛋糕 · API 点数包", "var(--accent)"],
                ] as const
              ).map(([m, title, desc, examples, color]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGrantMode(m)}
                  className={`border p-4 text-left transition-colors ${
                    grantMode === m ? "border-ink bg-base" : "border-line-strong bg-surface hover:border-ink"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                    <Led color={color} /> {title}
                    {grantMode === m && <span className="ml-auto">✓</span>}
                  </div>
                  <div className="text-[11px] text-muted-strong">{desc}</div>
                  <div className="mt-1 text-[10px] text-faint f-mono">{examples}</div>
                </button>
              ))}
            </div>
            {modeSwitched && (
              <div className="border border-destructive bg-destructive-band p-3 text-[11px] leading-relaxed text-destructive-strong">
                <strong>注意：</strong>切换发放形态会让已有的 {recordCount} 条快照按新语义解读（已用 ↔ 剩余），历史盈亏会失真。
              </div>
            )}
          </div>
        )}

        {cur === "字段" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">{kind === "COUNT" ? "计数型字段" : kind === "QUOTA" ? "额度型字段" : "省钱型"}</h2>
            {kind === "SAVINGS" ? (
              <div className="border border-ink p-4 text-[11px] leading-relaxed text-muted-strong">
                无需配置字段。省钱型记录的就是<strong>省下的金额</strong>：盈亏 = Σ已省 − 已摊成本。
                录入时可以逐笔记「本次已省」，也可以照抄平台「当期已省」累计值——系统自动与本区间已记求差，
                会员期重置后重新累计即可。
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>用量单位</label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder={kind === "COUNT" ? "次 / 小时 / 节" : "GB / 点数 / 条"}
                  className={inputCls}
                />
                <p className="mt-1 text-[10px] leading-relaxed text-faint">
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
                  <p className="mt-1 text-[10px] leading-relaxed text-faint">
                    不买这个订阅、按次单买要花多少钱一次（如健身房单次卡 ¥30）。
                    盈亏 = 次数 × 这个价 − 已摊成本。每次录入时还能临时改“本次单价”（涨价、不同项目）。
                  </p>
                </div>
              ) : stackedManual ? (
                <div className="border border-ink p-4 text-[11px] leading-relaxed text-muted-strong">
                  手动模式没有周期可推导发放计划，<strong>额度包需在详情页全部手动录入</strong>（下发日 / 数量 / 到期日）。
                  若产品按月自动下发，建议改用周期模式——系统会自动生成发放计划，你只需不定期抄一次剩余总量。
                </div>
              ) : grantMode === "STACKED" ? (
                <>
                  <div>
                    <label className={labelCls}>每周期下发量</label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={quotaTotal}
                      onChange={(e) => setQuotaTotal(e.target.value)}
                      placeholder="30"
                      className={inputCls}
                    />
                    <p className="mt-1 text-[10px] leading-relaxed text-faint">
                      每个周期下发一个包的数量（如像素蛋糕每月 30 张）。
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>包有效期（月）</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={packValidMonths}
                      onChange={(e) => setPackValidMonths(e.target.value)}
                      placeholder="12"
                      className={inputCls}
                    />
                    <p className="mt-1 text-[10px] leading-relaxed text-faint">
                      每个包从下发日起几个月有效（如 12 = 一年）。到期日排他，当天起不可用。
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label className={labelCls}>每月总额度</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={quotaTotal}
                    onChange={(e) => setQuotaTotal(e.target.value)}
                    placeholder="1000"
                    className={inputCls}
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-faint">
                    套餐每月给的总量（如 1000 GB）。录入时每次还能改（运营商偷偷加量减量都接得住）。
                  </p>
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {cur === "确认" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">确认</h2>
            <div className="border border-ink">
              {(
                [
                  ["类型", kind === "COUNT" ? "计数型（按次算回本）" : kind === "QUOTA" ? "额度型（看使用率）" : "省钱型（已省金额即价值）"],
                  ...(kind === "QUOTA"
                    ? [["发放形态", grantMode === "STACKED" ? "包叠加（多包共存，FEFO 推演浪费）" : "周期重置（区间末清零）"]]
                    : []),
                  ...(kind !== "SAVINGS" ? [["单位", unit || "（未填）"]] : []),
                  ...(kind === "COUNT"
                    ? [["替代单价", altUnitPrice ? `${fmtMoney(Number(altUnitPrice), currency)} / ${unit || "次"}` : "（未填）"]]
                    : kind === "QUOTA" && stackedManual
                      ? [["额度包", "详情页手动录入"]]
                      : kind === "QUOTA" && grantMode === "STACKED"
                        ? [
                            ["每周期下发量", quotaTotal ? `${quotaTotal} ${unit || ""}` : "（未填）"],
                            ["包有效期", `${packValidMonths || "?"} 个月`],
                          ]
                        : kind === "QUOTA"
                          ? [["每月总额度", quotaTotal ? `${quotaTotal} ${unit || ""}` : "（未填）"]]
                          : []),
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-ink px-3 py-2 text-[12px] last:border-b-0">
                  <span className="text-muted">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-faint">
              保存后详情页会出现「用量录入」和「盈亏 · 当前区间」两张卡片。
            </p>
            <form action={setUsageConfigAction.bind(null, subscriptionId)}>
              <input type="hidden" name="usageKind" value={kind} />
              <input type="hidden" name="usageUnit" value={unit} />
              {kind === "COUNT" && <input type="hidden" name="altUnitPrice" value={altUnitPrice} />}
              {kind === "QUOTA" && <input type="hidden" name="grantMode" value={grantMode} />}
              {kind === "QUOTA" && !stackedManual && <input type="hidden" name="quotaTotal" value={quotaTotal} />}
              {stackedCycle && <input type="hidden" name="packValidMonths" value={packValidMonths} />}
              <button className="w-full bg-ink py-2.5 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover">
                启用用量跟踪 →
              </button>
            </form>
          </div>
        )}

        {/* 底部导航 */}
        <div className="mt-5 flex justify-between border-t border-dashed border-line-strong pt-3">
          <button
            type="button"
            onClick={() => (step === 0 ? router.push(`/subscriptions/${subscriptionId}`) : setStep(step - 1))}
            className="border border-ink bg-surface px-4 py-1.5 text-[11px] uppercase tracking-wider hover:bg-ink hover:text-surface"
          >
            ← {step === 0 ? "返回" : "上一步"}
          </button>
          {step < steps.length - 1 && (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={
                cur === "字段" &&
                kind === "QUOTA" &&
                !stackedManual &&
                (!quotaTotal || (grantMode === "STACKED" && !packValidMonths))
              }
              className="bg-ink px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-surface hover:bg-ink-hover disabled:opacity-40"
            >
              下一步 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
