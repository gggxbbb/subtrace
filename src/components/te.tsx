// TE 风共享组件：黑描边面板、LED 点/点阵、KPI 卡。
// 设计语言：#E4E3E0 底、黑色 1px 描边白面板、橙 #FF5A00 强调（来自已定型的原型）。
// 金额格式化见 lib/format（fmtMoney），日期格式化见 lib/dates（isoDay/fmtDateTime）。

import { ArrowRight } from "lucide-react";

export const ORANGE = "var(--accent)";

/** 错误横幅：fx = 币种无汇率（ADR-0010），其余错误码显示 defaultMessage；error 为空不渲染 */
export function ErrorBanner({
  error,
  defaultMessage,
  className = "",
}: {
  error: string | null;
  defaultMessage: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      className={`border border-ink bg-accent px-3 py-2 text-[11px] uppercase text-white f-mono ${className}`}
    >
      {error === "fx"
        ? "币种无汇率：请先在设置→汇率添加币对，或手填折算金额"
        : defaultMessage}
    </div>
  );
}

/** 表单控件样式（多数派定义；设置区密集变体保留在各面板本地） */
export const inputCls =
  "w-full border border-ink bg-base px-2 py-1.5 text-sm outline-none focus:bg-surface";
export const labelCls =
  "mb-1 block text-[10px] uppercase tracking-[0.15em] text-muted f-mono";

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
    <section className="flex flex-col border border-ink bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink px-4 py-2.5">
        <span
          className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.15em] f-mono"
          title={`${index} — ${title}`}
        >
          <span className="text-faint">{index}</span> — {title}
        </span>
        <div className="shrink-0">
          {actions ??
            (action && (
            <a
              href={href}
              className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-muted f-mono hover:text-ink"
            >
              {action} <ArrowRight className="h-3 w-3" />
            </a>
          ))}
        </div>
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
    <div className="border border-ink bg-surface p-4">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.15em] text-muted f-mono">
        <span className="min-w-0 truncate" title={label}>{label}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-faint">
          {index} {led && <Led color={led} />}
        </span>
      </div>
      <div className="mt-2 truncate text-[28px] font-bold leading-none tracking-tight tabular-nums" title={value}>
        {value}
      </div>
      <div className="mt-2 truncate text-[10px] text-muted f-mono" title={sub}>{sub}</div>
    </div>
  );
}

