import { describe, expect, it } from "vitest";
import { gridLayout, resampleArea } from "./led-trend";

describe("resampleArea", () => {
  it("常数序列任意 n 精确恒等", () => {
    expect(resampleArea([4, 4, 4, 4], 4)).toEqual([4, 4, 4, 4]);
    expect(resampleArea([4, 4, 4, 4], 9).every((x) => x === 4)).toBe(true);
  });

  it("n = len 时偏差有界（≤ 相邻步进/4，面积模型与精确恒等互斥）", () => {
    const v = [1, 2.5, 3, 0, 7];
    const out = resampleArea(v, v.length);
    const maxStep = Math.max(...v.slice(1).map((x, i) => Math.abs(x - v[i])));
    out.forEach((x, i) => expect(Math.abs(x - v[i])).toBeLessThanOrEqual(maxStep / 4 + 1e-9));
  });

  it("总量守恒：Σout × (len/n) ≈ Σin（收缩与扩展）", () => {
    const v = Array.from({ length: 30 }, (_, i) => (i * 7) % 13 + (i % 3));
    const sumIn = v.reduce((s, x) => s + x, 0);
    for (const n of [8, 14, 20, 30, 50, 88]) {
      const out = resampleArea(v, n);
      const sumOut = out.reduce((s, x) => s + x, 0);
      expect(sumOut * (v.length / n)).toBeCloseTo(sumIn, 8);
    }
  });

  it("扩展等价线性坡：单调、端点精确", () => {
    const out = resampleArea([0, 10], 6);
    expect(out[0]).toBeCloseTo(0, 10);
    expect(out[5]).toBeCloseTo(10, 10);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });

  it("收缩摊薄尖峰但不消失", () => {
    const v = Array.from({ length: 30 }, (_, i) => (i === 15 ? 900 : 0));
    const out = resampleArea(v, 20);
    const peak = Math.max(...out);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(900); // 被摊薄
    expect(out.reduce((s, x) => s + x, 0) * (30 / 20)).toBeCloseTo(900, 8);
  });

  it("全零输入 → 全零输出；单值输入 → 常数输出", () => {
    expect(resampleArea([0, 0, 0], 10).every((x) => x === 0)).toBe(true);
    expect(resampleArea([5], 3)).toEqual([5, 5, 5]);
  });
});

describe("gridLayout", () => {
  it("347px 窄屏：50 列、点≈3px、14 行", () => {
    const g = gridLayout(347);
    expect(g.cols).toBe(50);
    expect(g.dot).toBeCloseTo(3.02, 2);
    expect(g.rows).toBe(14);
  });

  it("1000px 桌面：88 列封顶、点≈7.4px、9 行", () => {
    const g = gridLayout(1000);
    expect(g.cols).toBe(88);
    expect(g.dot).toBeCloseTo((1000 - 87 * 4) / 88, 6);
    expect(g.rows).toBe(9);
  });

  it("≥1144px：点径 9px 封顶、8 行（现状观感）", () => {
    const g = gridLayout(1600);
    expect(g.cols).toBe(88);
    expect(g.dot).toBe(9);
    expect(g.rows).toBe(8);
  });

  it("极端窄容器：8 列下限", () => {
    expect(gridLayout(50).cols).toBe(8);
    expect(gridLayout(0).cols).toBe(8);
  });
});
