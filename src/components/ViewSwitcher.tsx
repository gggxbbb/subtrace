"use client";

// 卡片↔列表视图切换器：list/card 两个视图由服务端渲染后以 slot 传入，
// 本组件只负责切换与 localStorage 持久化（按页一个 key）。
// 默认视图：无存储时桌面端用 desktopDefault，<md 一律卡片（ADR-0009）。

import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";

export type ViewKind = "list" | "card";

export function ViewSwitcher({
  storageKey,
  desktopDefault,
  list,
  card,
}: {
  storageKey: string;
  desktopDefault: ViewKind;
  list: React.ReactNode;
  card: React.ReactNode;
}) {
  const [view, setView] = useState<ViewKind>(desktopDefault);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "list" || stored === "card") {
      if (stored !== desktopDefault) setView(stored);
    } else if (window.matchMedia("(max-width: 767px)").matches && desktopDefault !== "card") {
      setView("card");
    }
  }, [storageKey, desktopDefault]);

  const switchTo = (v: ViewKind) => {
    setView(v);
    localStorage.setItem(storageKey, v);
  };

  const btn = (v: ViewKind, Icon: typeof List, label: string) => (
    <button
      type="button"
      onClick={() => switchTo(v)}
      aria-pressed={view === v}
      title={label}
      className={`flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase tracking-wider f-mono ${
        view === v ? "bg-black text-white" : "bg-white hover:bg-black/5"
      }`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} /> {label}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <div className="flex gap-px border border-black bg-black">
          {btn("card", LayoutGrid, "卡片")}
          {btn("list", List, "列表")}
        </div>
      </div>
      {view === "list" ? list : card}
    </div>
  );
}
