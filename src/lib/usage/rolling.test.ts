// 滑动窗判定缝测试（ADR-0014）：worked-example 字面量断言。
// 固定锚点：today = 2026-09-02（北京墙钟）→ 窗口 = [2026-08-03, 2026-09-02)，30 天，今天排他。

import { describe, expect, it } from "vitest";
import { rollingVerdict, rollingWindowOf, ROLLING_DAYS, type RollingInput } from "./rolling";
import type { CostSegment } from "../cost-engine";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);
const TODAY = d("2026-09-02");

const seg = (start: string, end: string, net: number): CostSegment => ({
  start: d(start),
  end: d(end),
  net,
  estimated: false,
});

const rec = (
  date: string,
  quantity: number,
  opts?: { kind?: string; semantic?: string | null; unitPrice?: number; userId?: string },
) => ({
  date: d(date),
  quantity,
  kind: opts?.kind ?? "DELTA",
  semantic: opts?.semantic ?? null,
  unitPrice: opts?.unitPrice,
  userId: opts?.userId,
});

const base = (over: Partial<RollingInput>): RollingInput => ({
  kind: "COUNT",
  startDate: d("2026-01-01"),
  today: TODAY,
  records: [],
  segments: [],
  ...over,
});

describe("rollingWindowOf 窗口边界", () => {
  it("窗口 = [今天−30d, 今天)，固定 30 天", () => {
    const w = rollingWindowOf(TODAY, d("2026-01-01"));
    expect(w.start).toEqual(d("2026-08-03"));
    expect(w.end).toEqual(d("2026-09-02"));
    expect(w.days).toBe(30);
    expect(ROLLING_DAYS).toBe(30);
  });

  it("订阅启用不足 30 天：窗口收窄到起始日，输出实际天数", () => {
    const w = rollingWindowOf(TODAY, d("2026-08-21"));
    expect(w.start).toEqual(d("2026-08-21"));
    expect(w.end).toEqual(d("2026-09-02"));
    expect(w.days).toBe(12);
  });

  it("起始日晚于今天（未开始的订阅）：天数为 0", () => {
    expect(rollingWindowOf(TODAY, d("2026-09-05")).days).toBe(0);
  });
});

describe("rollingVerdict 空窗口（当日启用 / 尚未开始）", () => {
  // startDate = today（或更晚）→ 窗口为空：出零值判定而非 null，红黑榜行不消失
  it("days=0 三口径均出零值判定", () => {
    const segments = [seg("2026-09-02", "2026-10-02", 300)];
    const count = rollingVerdict(base({ kind: "COUNT", startDate: TODAY, altUnitPrice: 30, segments }));
    expect(count).toMatchObject({ kind: "COUNT", windowDays: 0, cost: 0, usage: 0, value: 0, verdictAmount: 0, costPerUse: null });
    const savings = rollingVerdict(base({ kind: "SAVINGS", startDate: TODAY, segments }));
    expect(savings).toMatchObject({ kind: "SAVINGS", windowDays: 0, saved: 0, verdictAmount: 0 });
    const quota = rollingVerdict(base({ kind: "QUOTA", startDate: TODAY, quotaTotal: 100, segments }));
    expect(quota).toMatchObject({ kind: "QUOTA", windowDays: 0, consumed: 0, value: 0, verdictAmount: 0 });
  });

  it("startDate 晚于今天（未开始）同样零值判定", () => {
    const v = rollingVerdict(base({ kind: "COUNT", startDate: d("2026-09-05"), altUnitPrice: 30, segments: [seg("2026-09-05", "2026-10-05", 300)] }));
    expect(v).toMatchObject({ windowDays: 0, verdictAmount: 0 });
  });
});

describe("rollingVerdict COUNT（计数型）", () => {
  // 段 [08-04, 09-04) 净 310（31 天 × 10/天）；窗口交叠 [08-04, 09-02) = 29 天 → 成本 290
  const segments = [seg("2026-08-04", "2026-09-04", 310)];

  it("窗口净盈亏 = Σ（次数×替代单价） − periodCost（窗口）", () => {
    const v = rollingVerdict(
      base({
        altUnitPrice: 30,
        segments,
        records: [1, 2, 3, 4, 5].map((i) => rec(`2026-08-${9 + i}`, 1)),
      }),
    );
    if (v?.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v.windowDays).toBe(30);
    expect(v.windowStart).toEqual(d("2026-08-03"));
    expect(v.cost).toBeCloseTo(290);
    expect(v.usage).toBe(5);
    expect(v.value).toBe(150);
    expect(v.verdictAmount).toBeCloseTo(-140);
    expect(v.costPerUse).toBeCloseTo(58);
  });

  it("窗口边界翻转：起于今天−30d 含、止于今天排他", () => {
    const v = rollingVerdict(
      base({
        altUnitPrice: 30,
        segments,
        records: [
          rec("2026-08-02", 1), // 今天−31d：窗外
          rec("2026-08-03", 1), // 今天−30d = 窗口起点：含
          rec("2026-09-02", 1), // 今天 = 窗口排他终点：不含
        ],
      }),
    );
    if (v?.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v.usage).toBe(1);
    expect(v.value).toBe(30);
  });

  it("受益人视角：成本 × 份额、用量只计本人", () => {
    const v = rollingVerdict(
      base({
        altUnitPrice: 30,
        segments,
        share: 0.5,
        forUserId: "u1",
        records: [
          rec("2026-08-10", 1, { userId: "u1" }),
          rec("2026-08-11", 1, { userId: "u1" }),
          rec("2026-08-12", 1, { userId: "u1" }),
          rec("2026-08-10", 1, { userId: "u2" }),
          rec("2026-08-11", 1, { userId: "u2" }),
        ],
      }),
    );
    if (v?.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v.cost).toBeCloseTo(145);
    expect(v.usage).toBe(3);
    expect(v.value).toBe(90);
    expect(v.verdictAmount).toBeCloseTo(-55);
  });

  it("空记录：价值 0，净盈亏 = −窗口成本", () => {
    const v = rollingVerdict(base({ altUnitPrice: 30, segments }));
    if (v?.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v.usage).toBe(0);
    expect(v.value).toBe(0);
    expect(v.verdictAmount).toBeCloseTo(-290);
  });

  it("无替代单价：null（与周期 verdict 同语义）", () => {
    expect(rollingVerdict(base({ segments, records: [rec("2026-08-10", 1)] }))).toBeNull();
  });
});

describe("rollingVerdict SAVINGS（省钱型）", () => {
  it("净盈亏 = Σ窗口内增量 − periodCost（窗口）", () => {
    const v = rollingVerdict(
      base({
        kind: "SAVINGS",
        segments: [seg("2026-08-04", "2026-09-04", 310)],
        records: [
          rec("2026-08-02", 50), // 窗外
          rec("2026-08-05", 100),
          rec("2026-09-01", 20),
        ],
      }),
    );
    if (v?.kind !== "SAVINGS") throw new Error("expect SAVINGS");
    expect(v.saved).toBe(120);
    expect(v.cost).toBeCloseTo(290);
    expect(v.verdictAmount).toBeCloseTo(-170);
  });
});

describe("rollingVerdict QUOTA（额度型）", () => {
  // 用量周期：月，锚 08-01 → P1 [08-01,09-01)、P2 [09-01,10-01)。
  // 成本段：seg1 [08-01,09-01) 净 310（10/天）；seg2 [09-01,10-01) 净 150（5/天）。
  // 窗口 [08-03,09-02) 与 P1 重叠 29 天、与 P2 重叠 1 天。
  // 折算单价 = (29 × 310/100 + 1 × 150/100) / 30 = 91.4/30 ≈ 3.0467
  const quotaBase = (records: RollingInput["records"]): RollingInput =>
    base({
      kind: "QUOTA",
      quotaTotal: 100,
      usageCycle: { cycle: { kind: "calendar", unit: "month", count: 1 }, anchor: d("2026-08-01") },
      segments: [seg("2026-08-01", "2026-09-01", 310), seg("2026-09-01", "2026-10-01", 150)],
      records,
    });

  it("跨用量周期：折算单价按窗口重叠天数加权（周期成本 ÷ 总额度）", () => {
    const v = rollingVerdict(
      quotaBase([
        rec("2026-08-10", 100, { kind: "TOTAL", semantic: "USED" }), // 窗口内首快照：无前值记 0
        rec("2026-08-20", 250, { kind: "TOTAL", semantic: "USED" }), // +150
        rec("2026-09-01", 20, { kind: "TOTAL", semantic: "USED" }), // 复位负差 −230 不计消耗
      ]),
    );
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.consumed).toBe(150);
    expect(v.unitCost).toBeCloseTo(91.4 / 30);
    expect(v.value).toBeCloseTo(457); // 150 × 91.4/30
    expect(v.cost).toBeCloseTo(295); // 29 × 10 + 1 × 5
    expect(v.verdictAmount).toBeCloseTo(162);
  });

  it("REMAINING 语义：剩余降量即消耗；无用量周期时按成本段加权", () => {
    const v = rollingVerdict(
      base({
        kind: "QUOTA",
        quotaTotal: 100,
        usageCycle: null,
        segments: [seg("2026-08-01", "2026-09-01", 310)],
        records: [
          rec("2026-08-10", 90, { kind: "TOTAL", semantic: "REMAINING" }),
          rec("2026-08-20", 40, { kind: "TOTAL", semantic: "REMAINING" }), // 消耗 50
        ],
      }),
    );
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.consumed).toBe(50);
    expect(v.unitCost).toBeCloseTo(3.1);
    expect(v.value).toBeCloseTo(155);
    expect(v.cost).toBeCloseTo(290); // 29 天 × 10
    expect(v.verdictAmount).toBeCloseTo(-135);
  });

  it("无总额度：null（无法折算单价）", () => {
    const v = rollingVerdict(
      base({
        kind: "QUOTA",
        segments: [seg("2026-08-01", "2026-09-01", 310)],
        records: [rec("2026-08-10", 90, { kind: "TOTAL", semantic: "REMAINING" })],
      }),
    );
    expect(v).toBeNull();
  });

  it("STACKED：窗口内浪费事件按日期过滤输出（窗口外与到期日=今天的剔除）", () => {
    const v = rollingVerdict({
      ...quotaBase([rec("2026-08-20", 60, { kind: "TOTAL", semantic: "REMAINING" })]),
      stacked: true,
      wasteEvents: [
        { date: d("2026-07-15"), quantity: 3, amount: 9 }, // 窗外
        { date: d("2026-08-10"), quantity: 5, amount: 15.5 }, // 窗内
        { date: d("2026-09-02"), quantity: 1, amount: 3 }, // 到期日=今天（排他终点）：窗外
      ],
    });
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.wasteEvents).toEqual([{ date: d("2026-08-10"), quantity: 5, amount: 15.5 }]);
  });

  it("手动模式 STACKED 无总额度：折算单价回退段净额 ÷ 段内发放包量", () => {
    const v = rollingVerdict(
      base({
        kind: "QUOTA",
        stacked: true,
        segments: [seg("2026-07-01", "2027-07-01", 100)], // 365 天
        packs: [{ grantedAt: d("2026-07-01"), quantity: 30 }],
        records: [
          rec("2026-08-10", 30, { kind: "TOTAL", semantic: "REMAINING" }),
          rec("2026-08-20", 18, { kind: "TOTAL", semantic: "REMAINING" }), // 消耗 12
        ],
        wasteEvents: [],
      }),
    );
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.unitCost).toBeCloseTo(100 / 30);
    expect(v.consumed).toBe(12);
    expect(v.value).toBeCloseTo(40);
    expect(v.cost).toBeCloseTo((100 / 365) * 30);
    expect(v.verdictAmount).toBeCloseTo(40 - (100 / 365) * 30);
  });

  it("非 STACKED 不输出浪费事件", () => {
    const v = rollingVerdict(quotaBase([]));
    if (v?.kind !== "QUOTA") throw new Error("expect QUOTA");
    expect(v.wasteEvents).toBeUndefined();
  });
});

describe("rollingVerdict 边界", () => {
  it("启用不足 30 天：输出实际天数与收窄后的窗口", () => {
    const v = rollingVerdict(
      base({
        altUnitPrice: 30,
        startDate: d("2026-08-21"),
        segments: [seg("2026-08-21", "2026-09-21", 310)], // 31 天 × 10/天
        records: [rec("2026-08-25", 1), rec("2026-08-30", 1)],
      }),
    );
    if (v?.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v.windowDays).toBe(12);
    expect(v.windowStart).toEqual(d("2026-08-21"));
    expect(v.cost).toBeCloseTo(120); // 12 天 × 10
    expect(v.value).toBe(60);
    expect(v.verdictAmount).toBeCloseTo(-60);
  });

  it("空成本段（窗口无覆盖）：null（与周期 verdict 无覆盖同语义）", () => {
    expect(rollingVerdict(base({ altUnitPrice: 30, records: [rec("2026-08-10", 1)] }))).toBeNull();
  });

  it("窗口内成本段金额未知：costUnknown 透出，成本不计", () => {
    const v = rollingVerdict(
      base({
        altUnitPrice: 30,
        segments: [{ ...seg("2026-08-01", "2026-09-01", 0), amountUnknown: true }],
        records: [rec("2026-08-10", 2)],
      }),
    );
    if (v?.kind !== "COUNT") throw new Error("expect COUNT");
    expect(v.costUnknown).toBe(true);
    expect(v.cost).toBe(0);
    expect(v.value).toBe(60);
  });
});
