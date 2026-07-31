# 01 — resampleArea 与 gridLayout 纯函数

**What to build:** 两个纯函数（建议 `src/lib/led-trend.ts`，新文件）：

1. `resampleArea(values: number[], n: number): number[]` — 面积保持均值重采样。把 `values`（等间距日值序列，视为折线/阶梯下的面积）重采样到 n 个等宽桶，每桶输出该桶覆盖区间的积分均值。双向通用：n > values.length 为扩展（等价线性插值），n < 为收缩（桶内均值）。前缀和实现，$O(\text{len} + n)$。
2. `gridLayout(w: number): { cols: number; dot: number; rows: number }` — 行列推导。常数：GAP=4、DOT_MAX=9、HEIGHT=100、COLS_MIN=8、COLS_MAX=88。$cols=\text{clamp}(\lfloor(w+4)/7\rfloor, 8, 88)$；列宽 $=(w-(cols-1)\times4)/cols$；$dot=\min(\text{列宽},9)$；$rows=\lfloor104/(dot+4)\rfloor$。

**Blocked by:** None

**Status:** resolved

- [x] TDD：先写失败测试再实现
- [x] resampleArea：总量守恒（Σout×(len/n) ≈ Σin，浮点容差）；n=1；n=len 偏差有界；n>len 单调坡+端点精确；全零输入；单尖峰收缩后不消失（>0）
- [x] gridLayout：w=347 → cols=50, dot≈3, rows=14；w=1000 → cols=88（封顶）, dot≈7.4, rows=9；w≥1144 → dot=9, rows=8；w 极小 → cols=8 下限
- [x] `pnpm exec tsc --noEmit` + `pnpm test` 全绿

## Answer

实现于 `src/lib/led-trend.ts`（测试 `led-trend.test.ts`，10 例全绿）。

- `resampleArea`：bin 中心折线 + 两端常数外延模型，前缀积分 O(m+n)。**关键决策**：面积守恒与 n=m 精确恒等互斥（恒等要求桶对采样点对称，守恒要求桶是定义域划分），取守恒——偏差有界 ≤相邻步进/4，量化到整数行后不可见。
- `gridLayout`：cols=clamp(⌊(w+4)/7⌋, 8, 88)；dot=min(列宽, 9)（下限 1px 防御）；rows=⌊104/(dot+4)⌋。
- 密度政策追加裁决（spec §3）：单比值公式下「347px→50列」与「宽屏9px点」互斥，用户选定 88 封顶方案。

## Comments
