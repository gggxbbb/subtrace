# 02 — 趋势屏客户端化 + 窄屏响应

**What to build:** dashboard 点阵趋势屏按 spec 落地：

1. 新客户端组件（`"use client"`，如 `src/components/LedTrendChart.tsx`）：SSR/首帧渲染固定 100px 高纯黑带（`bg-[#111]`，零 CLS）；mount 后 ResizeObserver 测内容宽 → `gridLayout` → `resampleArea(30 天日值, cols)` → 柱高 `round(v/max*rows)`（max 从原始日值算，`Math.max(...data, 0.01)*1.1`）→ 沿用现有点亮规则（柱身橙、柱顶白 `#F5F4F0`、熄灭珠 `rgba(255,255,255,0.09)`）。
2. resize 不防抖：cols 为整数，宽度小幅波动不变 cols 就不 setState。
3. `src/app/(app)/dashboard/page.tsx` 的 `LedTrendChart` 改为服务端薄壳：只传 `data: number[]`（30 天原始日值），删除 88 列插值逻辑。
4. `te.tsx` 的 `LedMatrix` 通用组件不动；「即将到期」2×8 小点阵不动。

**Blocked by:** 01

**Status:** open

- [ ] 88 列常数与插值逻辑从 page.tsx 删除，无残留
- [ ] SSR HTML 中该屏为 100px 纯黑带（无点阵 span）
- [ ] tsc + 全量测试绿
- [ ] 浏览器冒烟（hub web + xd://browser，gggxbbb / test-password-123）：宽屏观感与现状一致；视口收窄到 ~413px 点阵清晰可见、黑带高度不变；拖宽拖窄无闪烁/无布局跳动

## Comments
