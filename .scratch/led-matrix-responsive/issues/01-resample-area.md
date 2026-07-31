# 01 — resampleArea 与 gridLayout 纯函数

**What to build:** 两个纯函数（建议 `src/lib/led-trend.ts`，新文件）：

1. `resampleArea(values: number[], n: number): number[]` — 面积保持均值重采样。把 `values`（等间距日值序列，视为折线/阶梯下的面积）重采样到 n 个等宽桶，每桶输出该桶覆盖区间的积分均值。双向通用：n > values.length 为扩展（等价线性插值），n < 为收缩（桶内均值）。前缀和实现，$O(\text{len} + n)$。
2. `gridLayout(w: number): { cols: number; dot: number; rows: number }` — 行列推导。常数：GAP=4、DOT_MIN=3、DOT_MAX=9、HEIGHT=100、COLS_MIN=8。$cols=\max(8, \lfloor(w+4)/7\rfloor)$；列宽 $=(w-(cols-1)\times4)/cols$；$dot=\min(\text{列宽},9)$；$rows=\lfloor104/(dot+4)\rfloor$。

**Blocked by:** None

**Status:** open

- [ ] TDD：先写失败测试再实现
- [ ] resampleArea：总量守恒（Σout×(len/n) ≈ Σin，浮点容差）；n=1；n=len 恒等；n>len 与线性插值等价；全零输入；单尖峰收缩后不消失（>0）
- [ ] gridLayout：w=347 → cols=50, dot≈3, rows=14；w 宽屏 → dot=9, rows=8；w 极小 → cols=8 下限
- [ ] `pnpm exec tsc --noEmit` + `pnpm test` 全绿

## Comments
