"use client";

import { useEffect, useRef, useState } from "react";
import { gridLayout, resampleArea } from "@/lib/led-trend";
import { LedMatrix } from "./te";

/**
 * 点阵趋势屏（.scratch/led-matrix-responsive）：行列随屏宽动态。
 * SSR/首帧按基准版式 88×8 直接出点（水合前的慢设备/弱网窗口不再是纯黑空屏），
 * mount 后 ResizeObserver 按实测宽度重量化；高度钉死 100px，重量化零 CLS。
 * 柱高 max 基准取原始日值，resize 只改量化粒度不改比例尺。柱身橙、柱顶白。
 */
const SSR_LAYOUT = gridLayout(1152); // 88 列 × 8 行：宽屏满铺基准，窄屏靠 1fr 列压缩

export function LedTrendChart({ data }: { data: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ cols: number; rows: number }>(SSR_LAYOUT);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number) => {
      const { cols, rows } = gridLayout(w);
      setLayout((prev) =>
        prev && prev.cols === cols && prev.rows === rows ? prev : { cols, rows },
      );
    };
    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 非有限值（上游 NaN/Infinity）按 0 渲染：一天坏数据不抹黑整屏
  const safe = data.map((v) => (Number.isFinite(v) ? v : 0));
  const max = Math.max(...safe, 0.01) * 1.1;
  const heights = resampleArea(safe, layout.cols).map((v) =>
    Math.max(0, Math.round((v / max) * layout.rows)),
  );

  return (
    <div className="bg-[#111] px-4 py-4">
      {/* 高度钉死 100px：行数零头沉屏底，黑底不可见；重量化只换点不换挡，无 CLS */}
      <div ref={ref} style={{ height: 100 }}>
        <LedMatrix
          rows={layout.rows}
          cols={layout.cols}
          size={9}
          gap={4}
          dark
          stretch
          lit={(r, c) => {
            const h = heights[c];
            const fromBottom = layout.rows - 1 - r;
            if (h === 0 || fromBottom >= h) return false;
            return fromBottom === h - 1 ? "#F5F4F0" : true;
          }}
        />
      </div>
    </div>
  );
}
