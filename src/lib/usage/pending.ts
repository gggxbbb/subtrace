/** 录入台「已记」判定（usage-shell ticket 01）：该订阅今日（北京墙钟 ISO 日）当前用户
 *  是否已有 DELTA 记录——「今日可记」窄条删除后，同一判定改作 COUNT 行的「已记」标记。
 *  按人切片（ADR-0003）：partner 的记录不算我的已记。 */

import { isoDay } from "../dates";

export interface LoggedTodayRecord {
  userId: string;
  kind: string;
  date: Date;
}

/** 今日已记 = 存在（userId 匹配 + kind=DELTA + date 落在 todayIsoDay）的记录 */
export function loggedToday(
  records: readonly LoggedTodayRecord[],
  todayIsoDay: string,
  userId: string,
): boolean {
  return records.some(
    (r) => r.userId === userId && r.kind === "DELTA" && isoDay(r.date) === todayIsoDay,
  );
}
