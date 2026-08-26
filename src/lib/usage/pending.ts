/** 「今日可记」过滤（ui-wave-a ticket 02）：今日（北京墙钟 ISO 日）当前用户尚无 DELTA 记录的
 *  计数型活跃订阅，按日均成本降序、cap 截断。排序/截收敛在函数内，调用方不再排序。 */

import { isoDay } from "../dates";

export interface PendingQuickLogSub {
  id: string;
  usageKind: string | null;
  status: string;
  /** 日均成本（我的份额口径）：仅排序用 */
  dailyCost: number;
}

export interface PendingQuickLogRecord {
  userId: string;
  kind: string;
  date: Date;
}

/**
 * 待记清单：usageKind === "COUNT" 且 status === "ACTIVE"，且该订阅不存在
 * （userId 匹配 + kind=DELTA + date 落在 todayIsoDay）的记录——即按人切片的今日缺口（ADR-0003）。
 * 返回按 dailyCost 降序、cap 截断（缺省 5）。
 */
export function pendingQuickLog<T extends PendingQuickLogSub>(
  subs: T[],
  recordsBySub: ReadonlyMap<string, readonly PendingQuickLogRecord[]>,
  todayIsoDay: string,
  userId: string,
  cap = 5,
): T[] {
  return subs
    .filter(
      (s) =>
        s.usageKind === "COUNT" &&
        s.status === "ACTIVE" &&
        !(recordsBySub.get(s.id) ?? []).some(
          (r) => r.userId === userId && r.kind === "DELTA" && isoDay(r.date) === todayIsoDay,
        ),
    )
    .sort((a, b) => b.dailyCost - a.dailyCost)
    .slice(0, cap);
}
