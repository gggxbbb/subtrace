import { describe, expect, it } from "vitest";
import { matchesKeyword, sortBy, subStatusOf } from "./list-query";

describe("sortBy", () => {
  const rows = [
    { name: "b", v: 2, d: new Date("2026-01-02"), n: null as number | null },
    { name: "a", v: 1, d: new Date("2026-01-01"), n: 5 },
    { name: "c", v: 3, d: null as Date | null, n: 3 },
  ];

  it("按字符串升序（中文 locale）", () => {
    expect(sortBy(rows, "asc", (r) => r.name).map((r) => r.name)).toEqual(["a", "b", "c"]);
  });

  it("按数值降序", () => {
    expect(sortBy(rows, "desc", (r) => r.v).map((r) => r.v)).toEqual([3, 2, 1]);
  });

  it("按日期升序，null 恒排最后（与方向无关）", () => {
    expect(sortBy(rows, "asc", (r) => r.d).map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(sortBy(rows, "desc", (r) => r.d).map((r) => r.name)).toEqual(["b", "a", "c"]);
  });

  it("数值 null 恒排最后", () => {
    expect(sortBy(rows, "asc", (r) => r.n).map((r) => r.n)).toEqual([3, 5, null]);
    expect(sortBy(rows, "desc", (r) => r.n).map((r) => r.n)).toEqual([5, 3, null]);
  });

  it("不改动原数组", () => {
    const before = rows.map((r) => r.name);
    sortBy(rows, "desc", (r) => r.v);
    expect(rows.map((r) => r.name)).toEqual(before);
  });
});

describe("subStatusOf", () => {
  it("CANCELLED 优先于一切日期推导", () => {
    expect(subStatusOf({ status: "CANCELLED", daysUntilExpiry: -5 })).toBe("cancelled");
  });

  it("到期日已过 → expired", () => {
    expect(subStatusOf({ status: "ACTIVE", daysUntilExpiry: -1 })).toBe("expired");
  });

  it("临期边界：0 与 14 天都算 soon，15 天算 ok", () => {
    expect(subStatusOf({ status: "ACTIVE", daysUntilExpiry: 0 })).toBe("soon");
    expect(subStatusOf({ status: "ACTIVE", daysUntilExpiry: 14 })).toBe("soon");
    expect(subStatusOf({ status: "ACTIVE", daysUntilExpiry: 15 })).toBe("ok");
  });

  it("无到期日 → ok", () => {
    expect(subStatusOf({ status: "ACTIVE", daysUntilExpiry: null })).toBe("ok");
  });
});

describe("matchesKeyword", () => {
  it("大小写不敏感包含匹配", () => {
    expect(matchesKeyword("Netflix Premium", "netfl")).toBe(true);
    expect(matchesKeyword("哔哩哔哩大会员", "大会")).toBe(true);
    expect(matchesKeyword("iCloud+", "spotify")).toBe(false);
  });

  it("关键字两端空白忽略", () => {
    expect(matchesKeyword("Netflix", "  net  ")).toBe(true);
  });
});
