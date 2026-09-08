import type { ReactNode } from "react";

/**
 * 页头（ADR-0009）：面包屑 + 标题 + 可选动作区。
 * <md：动作区换行到标题下方、按钮整枚换行（标签不断字）；≥md：恢复单行 h-16，桌面布局不变。
 */
export function PageHeader({
  crumb,
  title,
  actions,
}: {
  crumb: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-ink bg-base px-4 md:px-6">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 md:h-16 md:flex-nowrap md:py-0">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted f-mono">{crumb}</div>
          <h1 className="truncate text-xl font-bold uppercase tracking-tight">{title}</h1>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2.5 [&_a]:whitespace-nowrap [&_button]:whitespace-nowrap">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
