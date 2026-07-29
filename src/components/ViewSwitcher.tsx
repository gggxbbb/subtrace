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
  toolbar,
}: {
  storageKey: string;
  desktopDefault: ViewKind;
  list: React.ReactNode;
  card: React.ReactNode;
  /** 面板上方工具栏（排序/筛选控件），与切换按钮同行 */
  toolbar?: React.ReactNode;
}) {
  const [view, setView] = useState<ViewKind>(desktopDefault);

  // SSR/首帧渲染 desktopDefault 避免水合不匹配；挂载后必须读一次 localStorage/媒体查询，
  // 这是「与外部系统同步」——effect 的正当职责，此处同步 setState 属规则的本意例外，
  // 显式豁免而非绕开检测。
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "list" || stored === "card") {
      if (stored !== desktopDefault) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后同步本地存储，规则本意例外
        setView(stored);
      }
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
        view === v ? "bg-black text-white" : "bg-white hover:bg-[#E4E3E0]"
      }`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} /> {label}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {toolbar ?? <span />}
        <div className="flex shrink-0 gap-px border border-black bg-black">
          {btn("card", LayoutGrid, "卡片")}
          {btn("list", List, "列表")}
        </div>
      </div>
      {view === "list" ? list : card}
    </div>
  );
}
