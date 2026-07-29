"use client";

// 列表页工具栏（ui-polish 03）：排序字段 + 升降 + 分类 + 状态 + 关键字。
// 全部状态写入 URL searchParams（可刷新/分享）；关键字 300ms 防抖。

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

export interface ToolbarQuery {
  sort?: string;
  dir?: string;
  cat?: string;
  status?: string;
  q?: string;
}

const selCls = "border border-ink bg-surface px-2 py-1 text-[10px] uppercase tracking-wider f-mono outline-none";

export function ListToolbar({
  sortOptions,
  statusOptions,
  categories,
  current,
}: {
  sortOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  categories: string[];
  current: ToolbarQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q ?? "");
  const skipFirst = useRef(true);

  const update = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // 关键字防抖；跳过挂载时的初次同步
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const t = setTimeout(() => update({ q: q.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const dir = current.dir === "desc" ? "desc" : "asc";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={current.sort ?? ""}
        onChange={(e) => update({ sort: e.target.value })}
        className={selCls}
        title="排序字段"
      >
        <option value="">默认排序</option>
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {current.sort && (
        <button
          type="button"
          onClick={() => update({ dir: dir === "asc" ? "desc" : "asc" })}
          className={`${selCls} flex items-center gap-1 hover:bg-ink hover:text-surface`}
          title={dir === "asc" ? "升序（点击切换降序）" : "降序（点击切换升序）"}
        >
          {dir === "asc" ? (
            <ArrowUpNarrowWide className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <ArrowDownWideNarrow className="h-3 w-3" strokeWidth={2.5} />
          )}
          {dir === "asc" ? "升" : "降"}
        </button>
      )}
      <select
        value={current.cat ?? ""}
        onChange={(e) => update({ cat: e.target.value })}
        className={selCls}
        title="分类筛选"
      >
        <option value="">全部分类</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={current.status ?? ""}
        onChange={(e) => update({ status: e.target.value })}
        className={selCls}
        title="状态筛选"
      >
        <option value="">全部状态</option>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="关键字"
        className="w-28 border border-ink bg-base px-2 py-1 text-[11px] outline-none focus:bg-surface"
      />
    </div>
  );
}
