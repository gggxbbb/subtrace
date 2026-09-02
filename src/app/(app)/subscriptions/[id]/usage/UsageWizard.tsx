"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Led, inputCls, labelCls } from "@/components/te";
import { StepBar } from "@/components/StepWizard";
import { fmtMoney } from "@/lib/format";
import { setUsageConfigAction, disableUsageAction, purgeUsageAction } from "@/lib/usage/actions";
import type { GrantMode, UsageCycleUnit } from "@/lib/usage/service";

type Kind = "COUNT" | "QUOTA" | "SAVINGS";
/** 向导内的周期单位：QUARTER 是 UI 专属快捷选项（= MONTH + 每周期数 3），提交时映射回 MONTH */
type WizardCycleUnit = UsageCycleUnit | "QUARTER";

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
  initialUsageCycleUnit,
  initialUsageCycleCount,
  initialUsageCycleAnchor,
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
  /** 独立用量周期（ADR-0013）：空 = 跟随计费周期 */
  initialUsageCycleUnit: UsageCycleUnit | null;
  initialUsageCycleCount: number | null;
  initialUsageCycleAnchor: string | null;
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
  // 独立用量周期（ADR-0013）：已有周期则回显 CUSTOM 及其字段，否则跟随计费周期
  const [usageCycleMode, setUsageCycleMode] = useState<"FOLLOW" | "CUSTOM">(
    initialUsageCycleUnit && initialUsageCycleCount ? "CUSTOM" : "FOLLOW",
  );
  const [usageCycleUnit, setUsageCycleUnit] = useState<WizardCycleUnit>(
    (initialUsageCycleUnit as WizardCycleUnit | null) ?? "MONTH",
  );
  const [usageCycleCount, setUsageCycleCount] = useState(initialUsageCycleCount?.toString() ?? "1");
  const [usageCycleAnchor, setUsageCycleAnchor] = useState(initialUsageCycleAnchor ?? "");
  // 决策树首问选中某口径时的预填单位；SAVINGS 无单位概念
  const PRESET_UNIT: Record<Kind, string | null> = { COUNT: "次", QUOTA: "GB", SAVINGS: null };
  const chooseKind = (k: Kind) => {
    setKind(k);
    const preset = PRESET_UNIT[k];
    // 用户未自填（为空或仍是上一口径的预填值）时回填；手改过的单位不覆盖
    if (preset != null && (unit === "" || Object.values(PRESET_UNIT).includes(unit))) setUnit(preset);
  };

  // 编辑已有配置（initialKind 存在）跳过决策树（概念/类型/形态），直接进参数步；
  // 新开通走完整决策树，额度型多一步发放形态追问（每期重置 / 逐期累积）
  const steps = initialKind
    ? ["字段", "确认"]
    : kind === "QUOTA"
      ? ["概念", "类型", "形态", "字段", "确认"]
      : ["概念", "类型", "字段", "确认"];
  const cur = steps[Math.min(step, steps.length - 1)];
  const stackedCycle = kind === "QUOTA" && grantMode === "STACKED" && trackingMode === "CYCLE";
  const stackedManual = kind === "QUOTA" && grantMode === "STACKED" && trackingMode !== "CYCLE";

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
            额度型<strong>切换发放形态</strong>不影响已有记录：每条快照自带语义（已用/剩余），按录入时口径解读。
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
              订阅的成本系统已经在算了（实付金额按服务天数摊销）；用量跟踪再记录你<strong>实际用了多少</strong>，
              两相对比得出盈亏。下一步先用几个问题弄清这个订阅怎么给你价值，再按口径填参数。
            </p>
            <p className="text-[11px] text-faint">
              不启用也可以——用量跟踪是可选项，纯看成本的订阅不用开。
            </p>
          </div>
        )}

        {cur === "类型" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">这个订阅怎么给你价值？</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  ["COUNT", "按次使用", "每用一次值一次的钱，系统算“再去几次回本”", "健身房 · 按摩 · 洗车", "计数型", "var(--accent)"],
                  ["QUOTA", "每月给定量", "每期发一份固定额度，系统看使用率与浪费", "流量机场 · iCloud · API 点数", "额度型", "#0ea5e9"],
                  ["SAVINGS", "消费折扣", "会员帮你省钱，记下的就是省下的金额", "京东 Plus · 88VIP · 盒马 X", "省钱型", "#22c55e"],
                ] as const
              ).map(([k, title, desc, examples, term, color]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => chooseKind(k)}
                  className={`border p-4 text-left transition-colors ${
                    kind === k ? "border-ink bg-base" : "border-line-strong bg-surface hover:border-ink"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold">
                    <Led color={color} /> {title}
                    {kind === k && <span className="ml-auto">✓</span>}
                  </div>
                  <div className="text-[11px] text-muted-strong">{desc}</div>
                  <div className="mt-1 text-[10px] text-faint f-mono">{examples}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-wider text-faint f-mono">{term}</div>
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
                  ["RESET", "每期重置", "到期没用完就清零，下期重新发一份", "流量机场 · iCloud · 月度配额", "周期重置", "#0ea5e9"],
                  ["STACKED", "逐期累积", "多包共存、各自到期，停订全焚；只录剩余总量，系统 FEFO 推演浪费", "像素蛋糕 · API 点数包", "包叠加", "var(--accent)"],
                ] as const
              ).map(([m, title, desc, examples, term, color]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGrantMode(m)}
                  className={`border p-4 text-left transition-colors ${
                    grantMode === m ? "border-ink bg-base" : "border-line-strong bg-surface hover:border-ink"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold">
                    <Led color={color} /> {title}
                    {grantMode === m && <span className="ml-auto">✓</span>}
                  </div>
                  <div className="text-[11px] text-muted-strong">{desc}</div>
                  <div className="mt-1 text-[10px] text-faint f-mono">{examples}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-wider text-faint f-mono">{term}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {cur === "字段" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold">{kind === "COUNT" ? "计数型字段" : kind === "QUOTA" ? "额度型字段" : "省钱型"}</h2>
            {kind === "SAVINGS" ? (
              <div className="border border-ink p-4 text-[11px] leading-relaxed text-muted-strong">
                无需配置字段。省钱型记录的就是<strong>省下的金额</strong>：盈亏 = Σ已省 − 已摊成本。
                录入时可以逐笔记「本次已省」，也可以照抄平台「当期已省」累计值——系统自动与当前服务区间已记求差，
                会员期重置后重新累计即可。
              </div>
            ) : (
            <>
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
                    展示用，比如“9 次”“800 GB”。默认按上一步所选口径预填（{kind === "COUNT" ? "次" : "GB"}）；
                    不填不影响盈亏计算，仅展示处缺少单位。
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
                      不填则只记次数、算不出盈亏（价值未知），单价可以边用边补。
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
                        每个周期下发一个包的数量（如像素蛋糕每月 30 张）。必填——不填无法生成发放计划，向导不放行。
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
                        每个包从下发日起几个月有效（默认 12 = 一年）。到期日排他，当天起不可用。
                        必填——不填无法推每个包的到期日，向导不放行。
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
                      套餐每月给的总量（如 1000 GB）。必填——不填算不出使用率，向导不放行；
                      录入时每次还能改（运营商偷偷加量减量都接得住）。
                    </p>
                  </div>
                )}
              </div>
              {kind === "QUOTA" && (
                <div className="border border-ink p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase f-mono">
                    <Led color="#0ea5e9" /> 用量周期
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>周期模式</label>
                      <select
                        value={usageCycleMode}
                        onChange={(e) => setUsageCycleMode(e.target.value as "FOLLOW" | "CUSTOM")}
                        className={inputCls}
                      >
                        <option value="FOLLOW">跟随计费周期（默认）</option>
                        <option value="CUSTOM">独立周期</option>
                      </select>
                      <p className="mt-1 text-[10px] leading-relaxed text-faint">
                        默认「跟随计费周期」：额度随订阅计费周期重置；若套餐按独立周期重置（如季度包、年包），选「独立周期」。
                      </p>
                    </div>
                  </div>
                  {usageCycleMode === "CUSTOM" && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div>
                        <label className={labelCls}>周期单位</label>
                        <select
                          value={usageCycleUnit}
                          onChange={(e) => {
                            const v = e.target.value as typeof usageCycleUnit;
                            setUsageCycleUnit(v);
                            // 季 = MONTH + 每周期数 3
                            if (v === "QUARTER") setUsageCycleCount("3");
                          }}
                          className={inputCls}
                        >
                          <option value="DAY">天</option>
                          <option value="WEEK">周</option>
                          <option value="MONTH">月</option>
                          <option value="QUARTER">季</option>
                          <option value="YEAR">年</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>每周期数</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={usageCycleCount}
                          onChange={(e) => setUsageCycleCount(e.target.value)}
                          placeholder="1"
                          className={inputCls}
                        />
                        <p className="mt-1 text-[10px] leading-relaxed text-faint">
                          如「季」= 月 × 3。
                        </p>
                      </div>
                      <div>
                        <label className={labelCls}>锚定日</label>
                        <input
                          type="date"
                          value={usageCycleAnchor}
                          onChange={(e) => setUsageCycleAnchor(e.target.value)}
                          className={inputCls}
                        />
                        <p className="mt-1 text-[10px] leading-relaxed text-faint">
                          可选；留空则跟随订阅锚定日期。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
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
              {kind === "QUOTA" && usageCycleMode === "FOLLOW" && (
                <input type="hidden" name="usageCycleUnit" value="" />
              )}
              {kind === "QUOTA" && usageCycleMode === "CUSTOM" && (
                <>
                  <input
                    type="hidden"
                    name="usageCycleUnit"
                    value={usageCycleUnit === "QUARTER" ? "MONTH" : usageCycleUnit}
                  />
                  <input
                    type="hidden"
                    name="usageCycleCount"
                    value={usageCycleUnit === "QUARTER" ? "3" : usageCycleCount}
                  />
                  <input type="hidden" name="usageCycleAnchor" value={usageCycleAnchor} />
                </>
              )}
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
