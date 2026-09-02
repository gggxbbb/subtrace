import { describe, expect, it } from "vitest";
import { parseDay } from "../dates";
import { loggedToday, type LoggedTodayRecord } from "./pending";

const TODAY = "2026-08-26";
const ME = "u-me";

const rec = (userId: string, date: Date, kind = "DELTA"): LoggedTodayRecord => ({
  userId,
  kind,
  date,
});

describe("loggedToday（录入台「已记」判定）", () => {
  it("今日有本人 DELTA 记录 → 已记", () => {
    expect(loggedToday([rec(ME, parseDay(TODAY))], TODAY, ME)).toBe(true);
  });

  it("今日无记录 → 未记", () => {
    expect(loggedToday([], TODAY, ME)).toBe(false);
  });

  it("昨天的记录不算已记（今日边界）", () => {
    expect(loggedToday([rec(ME, parseDay("2026-08-25"))], TODAY, ME)).toBe(false);
  });

  it("北京墙钟边界：23:59 算今日已记，00:00 翻转到次日不算", () => {
    const lateToday = new Date("2026-08-26T15:59:59Z"); // 北京 23:59:59
    const nextDay = new Date("2026-08-26T16:00:00Z"); // 北京 次日 00:00
    expect(loggedToday([rec(ME, lateToday)], TODAY, ME)).toBe(true);
    expect(loggedToday([rec(ME, nextDay)], TODAY, ME)).toBe(false);
  });

  it("按人切片：partner 今日的记录不算我的已记", () => {
    expect(loggedToday([rec("u-partner", parseDay(TODAY))], TODAY, ME)).toBe(false);
  });

  it("非 DELTA 记录（TOTAL 快照）不算已记", () => {
    expect(loggedToday([rec(ME, parseDay(TODAY), "TOTAL")], TODAY, ME)).toBe(false);
  });
});
