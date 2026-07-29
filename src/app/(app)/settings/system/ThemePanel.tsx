"use client";

// 主题三态（dark-mode 04）：亮 / 暗 / 跟随系统。
// 存储键 theme 与根布局内联防闪脚本共用；选择即点即切并持久化。

import { useEffect, useState } from "react";
import { Panel } from "@/components/te";

type Theme = "light" | "dark" | "system";
const KEY = "theme";

const OPTIONS: { value: Theme; label: string; desc: string }[] = [
  { value: "light", label: "亮", desc: "始终使用浅色外观" },
  { value: "dark", label: "暗", desc: "始终使用深色外观" },
  { value: "system", label: "跟随系统", desc: "随操作系统的深浅色设置切换" },
];

function applyTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  const dark =
    t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemePanel() {
  const [theme, setTheme] = useState<Theme>("system");

  // 挂载后同步 localStorage 偏好（SSR 无法读取，首帧统一按 system 渲染避免水合不匹配）
  useEffect(() => {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后同步本地存储，规则本意例外
      setTheme(t);
    }
  }, []);

  return (
    <Panel index="01" title="外观 / 主题">
      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-px border border-ink bg-ink">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setTheme(o.value);
                applyTheme(o.value);
              }}
              aria-pressed={theme === o.value}
              className={`px-3 py-2 text-[11px] uppercase tracking-wider f-mono ${
                theme === o.value ? "bg-ink text-surface" : "bg-surface hover:bg-base"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] uppercase leading-relaxed tracking-wider text-muted f-mono">
          {OPTIONS.find((o) => o.value === theme)?.desc} · 选择保存在此浏览器
        </p>
      </div>
    </Panel>
  );
}
