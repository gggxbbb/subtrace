import { describe, expect, it } from "vitest";
import { pnlTone } from "./pnl";

describe("pnlTone 盈亏信号四态", () => {
  it("未启用用量（null）→ none", () => {
    expect(pnlTone(null)).toBe("none");
  });

  it("成本未知优先于金额符号 → unknown", () => {
    expect(pnlTone({ verdictAmount: 100, costUnknown: true })).toBe("unknown");
    expect(pnlTone({ verdictAmount: -100, costUnknown: true })).toBe("unknown");
  });

  it("盈（含 0：账本口径 0 = 无浪费）→ pos；亏 → neg", () => {
    expect(pnlTone({ verdictAmount: 319 })).toBe("pos");
    expect(pnlTone({ verdictAmount: 0 })).toBe("pos");
    expect(pnlTone({ verdictAmount: -12.5 })).toBe("neg");
  });
});
