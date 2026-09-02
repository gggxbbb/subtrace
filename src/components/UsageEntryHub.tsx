"use client";

import { useState } from "react";
import Link from "next/link";
import { QuickLogButtons } from "@/components/QuickLogButtons";
import { inputCls, labelCls } from "@/components/te";
import type { EntryHubRow } from "@/lib/dashboard";
import {
  addQuotaSnapshotAction,
  addSavingsAction,
  addUsageAction,
} from "@/lib/usage/actions";

const KIND_LABEL: Record<string, string> = {
  COUNT: "计数型",
  QUOTA: "额度型",
  SAVINGS: "省钱型",
};

const submitCls =
  "inline-flex min-h-[44px] items-center bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase text-surface hover:bg-ink-hover md:min-h-0";
const toggleCls =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-ink bg-surface px-2 py-0.5 text-[10px] uppercase f-mono hover:bg-ink hover:text-surface md:min-h-0 md:min-w-0";

/** 三口径表单共用的日期字段：默认今天（服务端北京墙钟 todayIso），允许补记过去、客户端 max 挡未来。 */
function DateField({ todayIso }: { todayIso: string }) {
  return (
    <div>
      <label className={labelCls}>日期</label>
      <input
        name="date"
        type="date"
        defaultValue={todayIso}
        max={todayIso}
        required
        className={`${inputCls} f-mono`}
      />
    </div>
  );
}

/** 「记用量」录入台（usage-shell ticket 01）：全部口径的活跃跟踪订阅平铺（日均成本降序）。
 *  COUNT：tuple 一键（写今日）+ 自定义展开（数量/单价/日期）；QUOTA：RESET 剩余/已用两姿势、
 *  STACKED 只收剩余；SAVINGS：本次已省或平台累计（求差语义沿用 addSavings）。
 *  日期默认服务器北京墙钟今日（todayIso 由服务端传入），允许过去补记、拒绝未来（服务端守卫）。
 *  失败回跳 /dashboard?error=quick（固定码先例）。移动端 44px 触控。 */
export function UsageEntryHub({
  rows,
  todayIso,
}: {
  rows: EntryHubRow[];
  todayIso: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] uppercase text-faint f-mono">
        还没有配置用量追踪的订阅
      </div>
    );
  }
  return (
    <div>
      {rows.map((r) => {
        const open = openId === r.id;
        const stacked = r.usageKind === "QUOTA" && r.grantMode === "STACKED";
        return (
          <div key={r.id} className="border-b border-line px-4 py-2 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href={`/subscriptions/${r.id}`}
                  className="min-w-0 truncate text-[13px] font-medium hover:underline"
                  title={r.name}
                >
                  {r.name}
                </Link>
                <span className="shrink-0 text-[9px] uppercase text-faint f-mono">
                  {KIND_LABEL[r.usageKind] ?? r.usageKind}
                </span>
                {r.loggedToday && (
                  <span className="shrink-0 border border-ink bg-surface px-1.5 py-0.5 text-[9px] uppercase f-mono">
                    已记
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.usageKind === "COUNT" && (
                  <QuickLogButtons
                    subscriptionId={r.id}
                    tuples={r.tuples}
                    unit={r.usageUnit}
                    back="/dashboard"
                  />
                )}
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : r.id)}
                  className={toggleCls}
                >
                  {open ? "收起" : r.usageKind === "COUNT" ? "自定义" : "记一笔"}
                </button>
              </div>
            </div>

            {open && r.usageKind === "COUNT" && (
              <form action={addUsageAction.bind(null, r.id)} className="mt-2 space-y-2">
                <input type="hidden" name="back" value="/dashboard" />
                <div className="flex flex-wrap items-end gap-2">
                  <DateField todayIso={todayIso} />
                  <div>
                    <label className={labelCls}>数量{r.usageUnit ? `（${r.usageUnit}）` : ""}</label>
                    <input
                      name="quantity"
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      className={`${inputCls} w-24`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>单价</label>
                    <input
                      name="unitPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={r.altUnitPrice != null ? `继承 ${r.altUnitPrice}` : "继承默认"}
                      className={`${inputCls} w-24`}
                    />
                  </div>
                  <button className={submitCls}>记录 →</button>
                </div>
                <div className="text-[9px] uppercase text-faint f-mono">
                  日期默认今天，可改过去补记；单价留空继承订阅替代单价
                </div>
              </form>
            )}

            {open && r.usageKind === "QUOTA" && (
              <form action={addQuotaSnapshotAction.bind(null, r.id)} className="mt-2 space-y-2">
                <input type="hidden" name="back" value="/dashboard" />
                <div className="flex flex-wrap items-end gap-2">
                  <DateField todayIso={todayIso} />
                  <div>
                    <label className={labelCls}>
                      剩余{r.usageUnit ? `（${r.usageUnit}）` : ""}
                    </label>
                    <input
                      name="remaining"
                      type="number"
                      step="any"
                      min="0"
                      className={`${inputCls} w-24`}
                    />
                  </div>
                  {!stacked && (
                    <>
                      <div>
                        <label className={labelCls}>
                          已用{r.usageUnit ? `（${r.usageUnit}）` : ""}
                        </label>
                        <input
                          name="used"
                          type="number"
                          step="any"
                          min="0"
                          className={`${inputCls} w-24`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>总额度</label>
                        <input
                          name="quotaTotal"
                          type="number"
                          step="any"
                          min="0.01"
                          placeholder={r.quotaTotal != null ? `继承 ${r.quotaTotal}` : "继承默认"}
                          className={`${inputCls} w-24`}
                        />
                      </div>
                    </>
                  )}
                  <button className={submitCls}>记录 →</button>
                </div>
                <div className="text-[9px] uppercase text-faint f-mono">
                  {stacked
                    ? "包叠加形态只收剩余快照；日期默认今天，可改过去补记"
                    : "剩余 / 已用二选一填一个，语义随记录落库（ADR-0013）；日期默认今天，可改过去补记"}
                </div>
              </form>
            )}

            {open && r.usageKind === "SAVINGS" && (
              <form action={addSavingsAction.bind(null, r.id)} className="mt-2 space-y-2">
                <input type="hidden" name="back" value="/dashboard" />
                <div className="flex flex-wrap items-end gap-2">
                  <DateField todayIso={todayIso} />
                  <div>
                    <label className={labelCls}>本次已省</label>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={`${inputCls} w-28`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>或平台累计已省</label>
                    <input
                      name="cumulative"
                      type="number"
                      step="0.01"
                      min="0"
                      className={`${inputCls} w-32`}
                    />
                  </div>
                  <button className={submitCls}>记录 →</button>
                </div>
                <div className="text-[9px] uppercase text-faint f-mono">
                  二选一：直接记本次省了多少；或照抄平台「当期已省」，自动与当期已记求差
                </div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
