import { describe, expect, it } from "vitest";
import { usageHeatmap, type HeatmapCell } from "./heatmap";

// 固定锚点：2026-08-26 是周三（北京墙钟）；所在周周一 = 2026-08-24，
// 窗口首日 = 周一往前 52 周 = 2025-08-25（同为周一），窗口末日 = 本周日 2026-08-30。
const TODAY = "2026-08-26";

const rec = (
  date: string,
  quantity: number,
  kind = "DELTA",
  semantic: string | null = null,
) => ({ date, quantity, kind, semantic });

/** 摊平矩阵 → 按 date 索引的格子表 */
const byDate = (weeks: HeatmapCell[][]) => new Map(weeks.flat().map((c) => [c.date, c]));

describe("usageHeatmap 窗口与网格结构", () => {
  it("空记录：53 列 × 7 行，全部 level 0 / value 0", () => {
    const weeks = usageHeatmap([], "COUNT", TODAY);
    expect(weeks).toHaveLength(53);
    for (const w of weeks) {
      expect(w).toHaveLength(7);
      for (const c of w) {
        expect(c.level).toBe(0);
        expect(c.value).toBe(0);
      }
    }
  });

  it("周一为首：窗口首日是该周周一，首列首格为周一", () => {
    const weeks = usageHeatmap([], "COUNT", TODAY);
    expect(weeks[0][0].date).toBe("2025-08-25"); // 周一
    expect(weeks[52][0].date).toBe("2026-08-24"); // 本周周一
    expect(weeks[52][6].date).toBe("2026-08-30"); // 本周日
  });

  it("今天（周三）落在最后一列第 3 行；未来日 inWindow=false", () => {
    const weeks = usageHeatmap([], "COUNT", TODAY);
    expect(weeks[52][2].date).toBe(TODAY);
    expect(weeks[52][2].inWindow).toBe(true);
    expect(weeks[52][3].inWindow).toBe(false); // 明天
    expect(weeks[52][6].inWindow).toBe(false);
    expect(weeks[0][0].inWindow).toBe(true);
  });

  it("today 传 Date 时按北京墙钟取日历日（UTC 前一日 17:30 = 北京次日 01:30）", () => {
    const weeks = usageHeatmap([], "COUNT", new Date("2026-08-25T17:30:00Z"));
    expect(weeks[52][2].date).toBe(TODAY);
    expect(weeks[52][2].inWindow).toBe(true);
  });

  it("超出窗口的记录忽略（窗口首日之前的值不进格）", () => {
    const weeks = usageHeatmap([rec("2025-08-24", 5)], "COUNT", TODAY);
    expect(byDate(weeks).get("2025-08-25")?.value).toBe(0);
    expect(weeks.flat().every((c) => c.value === 0)).toBe(true);
  });
});

describe("usageHeatmap 值语义", () => {
  it("COUNT：当日多条 Σ quantity", () => {
    const weeks = usageHeatmap([rec(TODAY, 1), rec(TODAY, 2), rec("2026-08-25", 4)], "COUNT", TODAY);
    const m = byDate(weeks);
    expect(m.get(TODAY)?.value).toBe(3);
    expect(m.get("2026-08-25")?.value).toBe(4);
    expect(m.get("2026-08-24")?.value).toBe(0);
  });

  it("SAVINGS：当日已省金额求和", () => {
    const weeks = usageHeatmap([rec(TODAY, 6.5), rec(TODAY, 3.5)], "SAVINGS", TODAY);
    expect(byDate(weeks).get(TODAY)?.value).toBe(10);
  });

  it("QUOTA：仅快照日有值；REMAINING 取降量、USED 取增量", () => {
    const weeks = usageHeatmap(
      [
        rec("2026-08-01", 100, "TOTAL", "REMAINING"),
        rec("2026-08-10", 70, "TOTAL", "REMAINING"),
        rec("2026-08-20", 50, "TOTAL", "USED"),
        rec("2026-08-21", 65, "TOTAL", "USED"),
      ],
      "QUOTA",
      TODAY,
    );
    const m = byDate(weeks);
    expect(m.get("2026-08-10")?.value).toBe(30); // 100 − 70
    expect(m.get("2026-08-21")?.value).toBe(15); // 65 − 50
    // 非快照日空白
    expect(m.get("2026-08-11")?.value).toBe(0);
    expect(m.get("2026-08-11")?.level).toBe(0);
  });

  it("QUOTA：窗口内首个快照无前值可差，value 0 / level 0", () => {
    const weeks = usageHeatmap([rec("2026-08-01", 100, "TOTAL", "REMAINING")], "QUOTA", TODAY);
    const c = byDate(weeks).get("2026-08-01");
    expect(c?.value).toBe(0);
    expect(c?.level).toBe(0);
  });

  it("QUOTA：窗口前快照不参与差值（忽略后首个窗口内快照仍无前值）", () => {
    const weeks = usageHeatmap(
      [
        rec("2025-08-24", 100, "TOTAL", "REMAINING"), // 窗口外
        rec("2025-08-25", 90, "TOTAL", "REMAINING"), // 窗口首日
      ],
      "QUOTA",
      TODAY,
    );
    expect(byDate(weeks).get("2025-08-25")?.value).toBe(0);
  });

  it("QUOTA：消耗 ≤0（额度回充）→ level 0，value 如实保留供 tooltip", () => {
    const weeks = usageHeatmap(
      [
        rec("2026-08-01", 100, "TOTAL", "REMAINING"),
        rec("2026-08-10", 120, "TOTAL", "REMAINING"),
      ],
      "QUOTA",
      TODAY,
    );
    const c = byDate(weeks).get("2026-08-10");
    expect(c?.value).toBe(-20);
    expect(c?.level).toBe(0);
  });
});

describe("usageHeatmap 5 档分位刻度", () => {
  it("全零 → 全 0 档", () => {
    const weeks = usageHeatmap([rec(TODAY, 0)], "COUNT", TODAY);
    expect(weeks.flat().every((c) => c.level === 0)).toBe(true);
  });

  it("单一非零值 → level 4", () => {
    const weeks = usageHeatmap([rec(TODAY, 7)], "COUNT", TODAY);
    expect(byDate(weeks).get(TODAY)?.level).toBe(4);
  });

  it("均匀分布 1/2/3/4 → level 1/2/3/4", () => {
    const weeks = usageHeatmap(
      [rec("2026-08-24", 1), rec("2026-08-25", 2), rec(TODAY, 3), rec("2026-08-20", 4)],
      "COUNT",
      TODAY,
    );
    const m = byDate(weeks);
    expect(m.get("2026-08-24")?.level).toBe(1);
    expect(m.get("2026-08-25")?.level).toBe(2);
    expect(m.get(TODAY)?.level).toBe(3);
    expect(m.get("2026-08-20")?.level).toBe(4);
  });

  it("并列值同档；value ≤ 0 不进入刻度", () => {
    const weeks = usageHeatmap(
      [rec("2026-08-24", 5), rec("2026-08-25", 5), rec(TODAY, 9)],
      "COUNT",
      TODAY,
    );
    const m = byDate(weeks);
    expect(m.get("2026-08-24")?.level).toBe(m.get("2026-08-25")?.level);
    expect(m.get(TODAY)?.level).toBe(4);
  });
});
