// 时间锚点（项目约定：全站北京时间 GMT+8，无 DST）。
// 所有"日期"都是北京日历日零点的瞬间（如 2026-07-20 → 2026-07-19T16:00:00Z）。
// 构造用 parseDay，显示用 isoDay/fmtDateTime，日界归一用 dayStart。

export const TZ_OFFSET_MS = 8 * 3600_000;
export const DAY_MS = 86_400_000;

/** 北京日历日零点（任意瞬间 → 其北京日的 00:00） */
export function dayStart(d: Date): Date {
  const wall = new Date(d.getTime() + TZ_OFFSET_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - TZ_OFFSET_MS);
}

/** "2026-07-20" → 北京当日零点 */
export function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00+08:00`);
}

/** 今天（北京日历日零点） */
export function today(): Date {
  return dayStart(new Date());
}

/** 瞬间 → 北京日历日字符串 "YYYY-MM-DD" */
export function isoDay(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** 瞬间 → 北京日期时间 "YYYY-MM-DD HH:mm" */
export function fmtDateTime(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

/** 北京墙钟的年/月/日（日历运算用；返回值即 UTC getter 语义的北京视图） */
export function wallParts(d: Date): { year: number; month: number; day: number } {
  const wall = new Date(d.getTime() + TZ_OFFSET_MS);
  return { year: wall.getUTCFullYear(), month: wall.getUTCMonth(), day: wall.getUTCDate() };
}

/** 北京墙钟的星期几（0=周日，同 getUTCDay 语义） */
export function wallDow(d: Date): number {
  return new Date(d.getTime() + TZ_OFFSET_MS).getUTCDay();
}

/** 由北京墙钟年/月/日构造瞬间（dayStart 的逆运算） */
export function fromWall(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - TZ_OFFSET_MS);
}
