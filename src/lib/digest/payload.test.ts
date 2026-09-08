import { describe, expect, it } from "vitest";
import type { DashboardData } from "@/lib/dashboard";
import { parseDay } from "@/lib/dates";
import { buildDigestPayload, digestFingerprint } from "./payload";

/** 最小 DashboardData 夹具：覆盖全部信号面，数值故意带浮点尾巴 */
function dashboardFixture(): DashboardData {
  return {
    totalDailyCost: 3.25,
    subDailyCost: 3.0,
    totalMonthlyCost: 97.5,
    monthSpent: 120.5,
    yearSpent: 980.75,
    activeCount: 2,
    rows: [],
    upcoming: [
      { id: "u1", name: "Netflix", date: parseDay("2026-09-20"), daysLeft: 12, amount: 68.0, auto: true },
      { id: "u2", name: "iCloud", date: parseDay("2026-10-01"), daysLeft: 23, amount: null, auto: false },
    ],
    purchases: [
      { id: "p1", name: "机械键盘", daysHeld: 45, dailyCost: 2.22, progress: 0.6, amountBase: 999, status: "active" },
      { id: "p2", name: "显示器", daysHeld: 400, dailyCost: 1.5, progress: undefined, amountBase: 1500, status: "done" },
    ],
    usageBoard: [
      {
        id: "s1",
        name: "ChatGPT Plus",
        windowLabel: "近30天",
        quantityLabel: "消耗 45 GB",
        paid: 99.0,
        value: 45.5,
        verdictAmount: -53.5,
        costUnknown: false,
        valueUnknown: false,
        stale: true,
        countdown: "9月20日到期 5GB · 预计剩 2",
        wasteNote: "9月1日到期焚毁 2GB",
      },
      {
        id: "s2",
        name: "健身房",
        windowLabel: "近12天",
        quantityLabel: "12 次",
        paid: 30.0,
        value: 60.0,
        verdictAmount: 30.0,
      },
    ],
    entryRows: [],
    usageById: new Map(),
    itemDailyCost: 0.25,
    trend: Array.from({ length: 30 }, (_, i) => i + 0.5),
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

describe("buildDigestPayload", () => {
  it("提取全部信号为 JSON-safe 结构（无 Date 实例）", () => {
    const payload = buildDigestPayload(dashboardFixture());
    // JSON 往返不丢信息 → 全是 JSON-safe 值
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    expect(JSON.stringify(payload)).not.toContain("2026-09-20T"); // Date 不应漏入
  });

  it("upcoming/purchases/usageBoard 逐字段提取，金额与状态原样保留", () => {
    const payload = buildDigestPayload(dashboardFixture());
    expect(payload.upcoming).toEqual([
      { name: "Netflix", daysLeft: 12, amount: 68, auto: true },
      { name: "iCloud", daysLeft: 23, amount: null, auto: false },
    ]);
    expect(payload.purchases).toEqual([
      { name: "机械键盘", daysHeld: 45, progress: 0.6, status: "active" },
      { name: "显示器", daysHeld: 400, progress: null, status: "done" },
    ]);
    expect(payload.usageBoard[0]).toEqual({
      name: "ChatGPT Plus",
      windowLabel: "近30天",
      quantityLabel: "消耗 45 GB",
      paid: 99,
      value: 45.5,
      verdictAmount: -53.5,
      costUnknown: false,
      valueUnknown: false,
      stale: true,
      countdown: "9月20日到期 5GB · 预计剩 2",
      wasteNote: "9月1日到期焚毁 2GB",
    });
    // 可选字段缺省 → 显式 null/false，保证序列化稳定
    expect(payload.usageBoard[1]).toEqual({
      name: "健身房",
      windowLabel: "近12天",
      quantityLabel: "12 次",
      paid: 30,
      value: 60,
      verdictAmount: 30,
      costUnknown: false,
      valueUnknown: false,
      stale: false,
      countdown: null,
      wasteNote: null,
    });
    expect(payload.monthSpent).toBe(120.5);
    expect(payload.yearSpent).toBe(980.75);
  });

  it("trend 聚合为总额/均值，不塞 30 个原始点", () => {
    const payload = buildDigestPayload(dashboardFixture());
    const trendSum = (30 * (0.5 + 29.5)) / 2;
    expect(payload.trend.total).toBeCloseTo(trendSum, 6);
    expect(payload.trend.average).toBeCloseTo(trendSum / 30, 6);
    expect(JSON.stringify(payload.trend)).not.toContain("29.5");
  });

  it("空 trend → 总额/均值均为 0", () => {
    const d = dashboardFixture();
    d.trend = [];
    const payload = buildDigestPayload(d);
    expect(payload.trend).toEqual({ total: 0, average: 0 });
  });

  it("展示态字段（rows/entryRows/usageById/trend 原始序列）不进载荷", () => {
    const payload = buildDigestPayload(dashboardFixture()) as unknown as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ["monthSpent", "purchases", "trend", "upcoming", "usageBoard", "yearSpent"].sort(),
    );
  });
});

describe("digestFingerprint", () => {
  it("sha256 hex 格式；同输入同指纹", () => {
    const payload = buildDigestPayload(dashboardFixture());
    const fp1 = digestFingerprint(payload, "user-1");
    const fp2 = digestFingerprint(buildDigestPayload(dashboardFixture()), "user-1");
    expect(fp1).toMatch(HEX64);
    expect(fp1).toBe(fp2);
  });

  it("键序无关：同值不同键插入序得同指纹", () => {
    const payload = buildDigestPayload(dashboardFixture());
    // 递归键逆序重排，模拟任何来源的同值对象
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverseKeys)
        : v !== null && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)]))
          : v;
    const reordered = reverseKeys(JSON.parse(JSON.stringify(payload))) as typeof payload;
    expect(digestFingerprint(reordered, "user-1")).toBe(digestFingerprint(payload, "user-1"));
  });

  it("任一信号值变化 → 指纹变", () => {
    const base = digestFingerprint(buildDigestPayload(dashboardFixture()), "user-1");
    const variants: Array<(d: DashboardData) => void> = [
      (d) => { d.monthSpent += 0.01; },
      (d) => { d.yearSpent -= 1; },
      (d) => { d.upcoming[0].daysLeft += 1; },
      (d) => { d.upcoming[0].auto = false; },
      (d) => { d.upcoming[1].amount = 6; },
      (d) => { d.usageBoard[0].verdictAmount = 0; },
      (d) => { d.usageBoard[0].wasteNote = undefined; },
      (d) => { d.usageBoard[0].stale = false; },
      (d) => { d.usageBoard[0].countdown = undefined; },
      (d) => { d.usageBoard[0].paid += 1; },
      (d) => { d.usageBoard[1].valueUnknown = true; },
      (d) => { d.purchases[0].progress = 0.61; },
      (d) => { d.purchases[0].daysHeld += 1; },
      (d) => { d.purchases[0].status = "done"; },
      (d) => { d.trend[29] += 1; }, // trend 聚合值变化
      (d) => { d.upcoming.pop(); }, // 条目增减
    ];
    for (const mutate of variants) {
      const d = dashboardFixture();
      mutate(d);
      expect(digestFingerprint(buildDigestPayload(d), "user-1")).not.toBe(base);
    }
  });

  it("展示态字段变化不影响指纹", () => {
    const base = digestFingerprint(buildDigestPayload(dashboardFixture()), "user-1");
    const d = dashboardFixture();
    d.totalDailyCost = 999; // KPI 展示字段，不在载荷里
    d.activeCount = 42;
    expect(digestFingerprint(buildDigestPayload(d), "user-1")).toBe(base);
  });

  it("同数据不同 userId → 不同指纹", () => {
    const payload = buildDigestPayload(dashboardFixture());
    expect(digestFingerprint(payload, "user-1")).not.toBe(digestFingerprint(payload, "user-2"));
  });

  it("浮点定点化不抖：0.1+0.2 与 0.3 同指纹", () => {
    const d1 = dashboardFixture();
    d1.monthSpent = 0.1 + 0.2; // 0.30000000000000004
    const d2 = dashboardFixture();
    d2.monthSpent = 0.3;
    expect(digestFingerprint(buildDigestPayload(d1), "user-1")).toBe(
      digestFingerprint(buildDigestPayload(d2), "user-1"),
    );
  });
});
