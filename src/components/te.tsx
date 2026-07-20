// TE 风共享组件：黑描边面板、LED 点/点阵、KPI 卡。
// 设计语言：#E4E3E0 底、黑色 1px 描边白面板、橙 #FF5A00 强调（来自已定型的原型）。

import { wallParts } from "@/lib/dates";
import { ArrowRight } from "lucide-react";

export const ORANGE = "#FF5A00";

export function Led({ color = ORANGE }: { color?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color }}
    />
  );
}

/** LED 点阵：rows×cols 圆点阵列，未点亮点低透明度（熄灭的灯珠） */
export function LedMatrix({
  rows,
  cols,
  lit,
  dark = false,
  size = 6,
  gap = 4,
  stretch = false,
}: {
  rows: number;
  cols: number;
  /** false=熄灭，true=默认橙，字符串=指定颜色 */
  lit: (r: number, c: number) => boolean | string;
  dark?: boolean;
  size?: number;
  gap?: number;
  stretch?: boolean;
}) {
  return (
    <div
      role="img"
      style={{
        display: "grid",
        gridTemplateColumns: stretch
          ? `repeat(${cols}, 1fr)`
          : `repeat(${cols}, ${size}px)`,
        gap,
      }}
    >
      {Array.from({ length: rows * cols }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const v = lit(r, c);
        return (
          <span
            key={i}
            style={{
              width: stretch ? "100%" : size,
              ...(stretch
                ? { aspectRatio: "1", maxWidth: size, maxHeight: size }
                : { height: size }),
              borderRadius: "50%",
              background: v
                ? typeof v === "string"
                  ? v
                  : ORANGE
                : dark
                  ? "rgba(255,255,255,0.09)"
                  : "rgba(0,0,0,0.08)",
            }}
          />
        );
      })}
    </div>
  );
}

/** 编号面板：黑描边白底 + "NN — 标题" 头部 */
export function Panel({
  index,
  title,
  action,
  href,
  actions,
  children,
}: {
  index: string;
  title: string;
  action?: string;
  href?: string;
  /** 标题行右侧自定义操作区（优先于 action/href） */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col border border-black bg-white">
      <header className="flex shrink-0 items-center justify-between border-b border-black px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] f-mono">
          <span className="text-neutral-400">{index}</span> — {title}
        </span>
        {actions ??
          (action && (
            <a
              href={href}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-500 f-mono hover:text-black"
            >
              {action} <ArrowRight className="h-3 w-3" />
            </a>
          ))}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function Kpi({
  index,
  label,
  value,
  sub,
  led,
}: {
  index: string;
  label: string;
  value: string;
  sub: string;
  led?: string;
}) {
  return (
    <div className="border border-black bg-white p-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
        <span>{label}</span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          {index} {led && <Led color={led} />}
        </span>
      </div>
      <div className="mt-2 text-[28px] font-bold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-2 text-[10px] text-neutral-500 f-mono">{sub}</div>
    </div>
  );
}

/** 主币种金额格式化（v1 单币种展示） */
export const fmt = (n: number) =>
  n.toLocaleString("zh-CN", { style: "currency", currency: "CNY" });

/** 日期格式化 YYYY-MM-DD（北京墙钟，ADR-0008） */
export const fmtDate = (d: Date) => {
  const { year, month, day } = wallParts(d);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
