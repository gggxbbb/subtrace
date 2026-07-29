// 表单字段解析（ADR-0008）：server action 的 FormData → 领域输入。
// 日期一律委托 dates.parseDay（北京墙钟单一构造入口）；数字空串/非法 → undefined。

import { parseDay } from "./dates";

/** 数字字段：空/非数 → undefined（调用方决定缺省语义） */
export function numField(v: FormDataEntryValue | null): number | undefined {
  if (v == null || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 日期字段："YYYY-MM-DD" → 北京当日零点 */
export function dayField(v: FormDataEntryValue | null): Date {
  return parseDay(String(v));
}
