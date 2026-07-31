"use client";

import { useEffect, useRef, useState } from "react";
import { gridLayout, resampleArea } from "@/lib/led-trend";
import { LedMatrix } from "./te";

/**
 * 点阵趋势屏（.scratch/led-matrix-responsive）：行列随屏宽动态。
 * SSR/首帧 = 固定 100px 纯黑带（零 CLS），mount 后 ResizeObserver 测宽出点；
 * 柱高 max 基准取原始日值，resize 只改量化粒度不改比例尺。柱身橙、柱顶白。
 */
export function LedTrendChart({ data }: { data: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ cols: number; rows: number } | null>(null);

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

  const max = Math.max(...data, 0.01) * 1.1;
  const heights = layout
    ? resampleArea(data, layout.cols).map((v) =>
        Math.max(0, Math.round((v / max) * layout.rows)),
      )
    : null;

  return (
    <div className="bg-[#111] px-4 py-4">
      {/* 高度钉死 100px：行数零头沉屏底，黑底不可见；SSR 与首帧同构，无 CLS */}
      <div ref={ref} style={{ height: 100 }}>
        {heights && layout && (
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
        )}
      </div>
    </div>
  );
}
