// 金额解析（ADR-0010）：FormData 金额三件套 → { amount, currency, amountBase }。
// 服务端兜底决策树（预填只是 UX，不变量在服务端）：
//   币种空/同主币种      → 快照 = 原币金额（正当 1:1）
//   外币 + 手填折算      → 用手填值（ADR-0004：录入即事实）
//   外币 + 未手填 + 有汇率 → 查汇率表计算（两位小数）
//   外币 + 未手填 + 无汇率 → 抛 NoRateError（action 映射 ?error=fx），不再静默 1:1

import { getRate } from "./exchange/service";
import { numField } from "./form";

export interface MoneyResult {
  amount: number | null;
  currency: string | null;
  amountBase: number | null;
}

/** 外币未手填折算且汇率表无此币对：拒绝提交（ADR-0010） */
export class NoRateError extends Error {
  readonly code = "fx" as const;
  constructor(public readonly currency: string) {
    super(`币种 ${currency} 无汇率：请先配汇率或手填折算 no_rate`);
  }
}

/** 必填金额缺失或非法 */
export class BadAmountError extends Error {
  constructor() {
    super("金额必填 bad_amount");
  }
}

export interface ResolveMoneyOptions {
  /** 字段名前缀："first" → firstAmount/firstCurrency/firstAmountBase */
  prefix?: string;
  /** 显式字段名（覆盖 prefix），用于标准价等非同构命名 */
  names?: { amount: string; currency: string; amountBase: string };
  /** 金额留空 = 金额未知（ticket 12）：输出三字段全 null */
  allowUnknown?: boolean;
  /** 金额必须为正（追加费用/收益等不可为 0 或负） */
  requirePositive?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function resolveMoney(
  formData: FormData,
  user: { id: string; baseCurrency: string },
  opts: ResolveMoneyOptions = {},
): Promise<MoneyResult> {
  const suffix = (s: string) => (opts.prefix ? `${opts.prefix}${s[0].toUpperCase()}${s.slice(1)}` : s);
  const names = opts.names ?? {
    amount: suffix("amount"),
    currency: suffix("currency"),
    amountBase: suffix("amountBase"),
  };
  const amount = numField(formData.get(names.amount));
  if (amount === undefined) {
    if (opts.allowUnknown) return { amount: null, currency: null, amountBase: null };
    throw new BadAmountError();
  }
  if (opts.requirePositive && amount <= 0) throw new BadAmountError();

  const base = user.baseCurrency;
  const rawCur = String(formData.get(names.currency) ?? "").trim().toUpperCase();
  const currency = rawCur || base;
  if (currency === base) return { amount, currency, amountBase: amount };

  const manual = numField(formData.get(names.amountBase));
  if (manual !== undefined) return { amount, currency, amountBase: manual };

  const rate = await getRate(user.id, currency);
  if (rate === null) throw new NoRateError(currency);
  return { amount, currency, amountBase: round2(amount * rate) };
}
