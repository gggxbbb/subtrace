# 02 — 趋势屏客户端化 + 窄屏响应

**What to build:** dashboard 点阵趋势屏按 spec 落地：

1. 新客户端组件（`"use client"`，如 `src/components/LedTrendChart.tsx`）：SSR/首帧渲染固定 100px 高纯黑带（`bg-[#111]`，零 CLS）；mount 后 ResizeObserver 测内容宽 → `gridLayout` → `resampleArea(30 天日值, cols)` → 柱高 `round(v/max*rows)`（max 从原始日值算，`Math.max(...data, 0.01)*1.1`）→ 沿用现有点亮规则（柱身橙、柱顶白 `#F5F4F0`、熄灭珠 `rgba(255,255,255,0.09)`）。
2. resize 不防抖：cols 为整数，宽度小幅波动不变 cols 就不 setState。
3. `src/app/(app)/dashboard/page.tsx` 的 `LedTrendChart` 改为服务端薄壳：只传 `data: number[]`（30 天原始日值），删除 88 列插值逻辑。
4. `te.tsx` 的 `LedMatrix` 通用组件不动；「即将到期」2×8 小点阵不动。

**Blocked by:** 01

**Status:** resolved

- [x] 88 列常数与插值逻辑从 page.tsx 删除，无残留
- [x] SSR HTML 中该屏为 100px 纯黑带（无点阵 span）
- [x] tsc + 全量测试绿
- [x] 浏览器冒烟（hub web + xd://browser，gggxbbb / test-password-123）：宽屏观感与现状一致；视口收窄到 ~413px 点阵清晰可见、黑带高度不变；拖宽拖窄无闪烁/无布局跳动

## Answer

实现于 `src/components/LedTrendChart.tsx`（client），`dashboard/page.tsx` 删内联旧实现改为服务端薄壳传 `d.trend`。

- 结构：外层 `bg-[#111] px-4 py-4` + 内层钉死 `height:100` 测量盒；`layout===null` 时不渲染点阵 → SSR 与首帧同构纯黑带（实测 SSR HTML role=img 3 个 = 即将到期小点阵，live 4 个，差值即趋势屏）。行数零头沉底被黑底吃掉，任何宽度带高恒 100 → 零 CLS。
- ResizeObserver → `gridLayout(w)`；cols/rows 不变时 setState 返回旧引用，天然防抖。
- 柱高：`resampleArea(data, cols)` → `round(v/max*rows)`，max 从原始 `data` 算（比例尺与 resize 解耦）。复用 `te.tsx` 的 LedMatrix（stretch + size=9 封顶正好是 gridLayout 的 dot 语义），通用组件未动。
- 冒烟实测：413px → 50列×14行、点 3.03px、635 亮点；1400px → 88列×8行、点 8.48px；截图确认窄屏全屏可见、观感与宽屏一致。tsc + 204 测试全绿。

## Comments
