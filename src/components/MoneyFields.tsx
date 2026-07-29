"use client";

// 金额录入组件（ADR-0010）：三件套（原币金额 + 币种 + 折算主币种）+ 内置汇率预填。
// 手填优先：用户改过折算后不再自动覆写；查无汇率或同主币种时清掉自动值。
// 本组件只做 UX——兜底不变量在服务端 lib/money.resolveMoney（无汇率拒绝提交）。

import { useState } from "react";
import { lookupRateAction } from "@/lib/exchange/actions";

const inputCls =
  "w-full border border-black bg-[#E4E3E0] px-2 py-1.5 text-sm outline-none focus:bg-white";
const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono";

export interface MoneyNames {
  amount: string;
  currency: string;
  amountBase: string;
}

/** 与 lib/money.resolveMoney 一致的命名约定：prefix="first" → firstAmount/firstCurrency/firstAmountBase */
export function moneyNames(prefix = ""): MoneyNames {
  const s = (x: string) => (prefix ? `${prefix}${x[0].toUpperCase()}${x.slice(1)}` : x);
  return { amount: s("amount"), currency: s("currency"), amountBase: s("amountBase") };
}

export function MoneyFields({
  prefix = "",
  names,
  defaults,
  labels,
  allowUnknown = false,
  layout = "grid",
}: {
  prefix?: string;
  /** 显式字段名（覆盖 prefix），用于标准价等非同构命名 */
  names?: MoneyNames;
  defaults?: { amount?: number | null; currency?: string | null; amountBase?: number | null };
  labels?: { amount?: string; currency?: string; amountBase?: string };
  /** 金额留空 = 金额未知（ticket 12） */
  allowUnknown?: boolean;
  /** grid = 三列网格；inline = 行内定宽（配合外层 flex 行） */
  layout?: "grid" | "inline";
}) {
  const n = names ?? moneyNames(prefix);
  const l = { amount: "金额", currency: "币种", amountBase: "折算主币种", ...labels };
  const [amount, setAmount] = useState(defaults?.amount != null ? String(defaults.amount) : "");
  const [currency, setCurrency] = useState(defaults?.currency ?? "");
  const [amountBase, setAmountBase] = useState(
    defaults?.amountBase != null ? String(defaults.amountBase) : "",
  );
  const [lastAuto, setLastAuto] = useState<number | null>(null);

  /** 失焦预填：金额与币种都有值、且折算框为空（或等于上次自动值）时按汇率表覆写 */
  const fill = async () => {
    const amt = Number(amount);
    const cur = currency.trim();
    if (!amt || !cur) return;
    if (amountBase.trim() !== "" && Number(amountBase) !== lastAuto) return;
    const rate = await lookupRateAction(cur);
    if (rate === null || rate === 1) {
      if (lastAuto !== null && amountBase === String(lastAuto)) setAmountBase("");
      setLastAuto(null);
      return;
    }
    const v = Math.round(amt * rate * 100) / 100;
    setLastAuto(v);
    setAmountBase(String(v));
  };

  const unknownHint = allowUnknown ? "留空 = 未知" : undefined;
  const amountField = (
    <div className={layout === "inline" ? "w-28" : undefined}>
      <label className={labelCls}>{l.amount}</label>
      <input
        name={n.amount}
        type="number"
        step="0.01"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={fill}
        required={!allowUnknown}
        placeholder={unknownHint}
        className={inputCls}
      />
    </div>
  );
  const currencyField = (
    <div className={layout === "inline" ? "w-20" : undefined}>
      <label className={labelCls}>{l.currency}</label>
      <input
        name={n.currency}
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        onBlur={fill}
        placeholder={allowUnknown ? unknownHint : undefined}
        className={`${inputCls} f-mono`}
      />
    </div>
  );
  const baseField = (
    <div className={layout === "inline" ? "w-28" : undefined}>
      <label className={labelCls}>{l.amountBase}</label>
      <input
        name={n.amountBase}
        type="number"
        step="0.01"
        min="0"
        value={amountBase}
        onChange={(e) => setAmountBase(e.target.value)}
        placeholder={unknownHint ?? "留空 = 自动折算"}
        className={inputCls}
      />
    </div>
  );

  if (layout === "inline") {
    return (
      <>
        {amountField}
        {currencyField}
        {baseField}
      </>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {amountField}
      {currencyField}
      {baseField}
    </div>
  );
}
