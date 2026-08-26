import { describe, expect, it } from "vitest";
import { parseDay } from "../dates";
import { pendingQuickLog, type PendingQuickLogRecord, type PendingQuickLogSub } from "./pending";

const TODAY = "2026-08-26";
const ME = "u-me";

const sub = (
  id: string,
  overrides: Partial<PendingQuickLogSub> = {},
): PendingQuickLogSub => ({ id, usageKind: "COUNT", status: "ACTIVE", dailyCost: 1, ...overrides });

const rec = (userId: string, date: Date, kind = "DELTA"): PendingQuickLogRecord => ({
  userId,
  kind,
  date,
});

const recordsOf = (entries: Record<string, PendingQuickLogRecord[]>) =>
  new Map(Object.entries(entries));

describe("pendingQuickLog", () => {
  it("今日无 DELTA 记录的计数型活跃订阅入选", () => {
    const subs = [sub("a")];
    expect(pendingQuickLog(subs, new Map(), TODAY, ME).map((s) => s.id)).toEqual(["a"]);
  });

  it("今日已记（userId 匹配 + DELTA + 今日）即消失", () => {
    const subs = [sub("a")];
    const records = recordsOf({ a: [rec(ME, parseDay(TODAY))] });
    expect(pendingQuickLog(subs, records, TODAY, ME)).toEqual([]);
  });

  it("昨天的记录不算已记（今日边界）", () => {
    const subs = [sub("a")];
    const records = recordsOf({ a: [rec(ME, parseDay("2026-08-25"))] });
    expect(pendingQuickLog(subs, records, TODAY, ME).map((s) => s.id)).toEqual(["a"]);
  });

  it("北京墙钟边界：23:59 算今日已记，00:00 翻转到次日不算", () => {
    const lateToday = new Date("2026-08-26T15:59:59Z"); // 北京 23:59:59
    const nextDay = new Date("2026-08-26T16:00:00Z"); // 北京 次日 00:00
    expect(
      pendingQuickLog([sub("a")], recordsOf({ a: [rec(ME, lateToday)] }), TODAY, ME),
    ).toEqual([]);
    expect(
      pendingQuickLog([sub("a")], recordsOf({ a: [rec(ME, nextDay)] }), TODAY, ME).map((s) => s.id),
    ).toEqual(["a"]);
  });

  it("按人切片：partner 今日的记录不算我的已记", () => {
    const subs = [sub("a")];
    const records = recordsOf({ a: [rec("u-partner", parseDay(TODAY))] });
    expect(pendingQuickLog(subs, records, TODAY, ME).map((s) => s.id)).toEqual(["a"]);
  });

  it("非 DELTA 记录（TOTAL 快照）不算已记", () => {
    const subs = [sub("a")];
    const records = recordsOf({ a: [rec(ME, parseDay(TODAY), "TOTAL")] });
    expect(pendingQuickLog(subs, records, TODAY, ME).map((s) => s.id)).toEqual(["a"]);
  });

  it("非计数型（QUOTA/SAVINGS/null）与非活跃订阅不出现", () => {
    const subs = [
      sub("count"),
      sub("quota", { usageKind: "QUOTA" }),
      sub("savings", { usageKind: "SAVINGS" }),
      sub("none", { usageKind: null }),
      sub("cancelled", { status: "CANCELLED" }),
    ];
    expect(pendingQuickLog(subs, new Map(), TODAY, ME).map((s) => s.id)).toEqual(["count"]);
  });

  it("按日均成本降序、cap 5 截断", () => {
    const subs = [
      sub("a", { dailyCost: 3 }),
      sub("b", { dailyCost: 9 }),
      sub("c", { dailyCost: 1 }),
      sub("d", { dailyCost: 7 }),
      sub("e", { dailyCost: 5 }),
      sub("f", { dailyCost: 2 }),
    ];
    expect(pendingQuickLog(subs, new Map(), TODAY, ME).map((s) => s.id)).toEqual([
      "b",
      "d",
      "e",
      "a",
      "f",
    ]);
  });
});
