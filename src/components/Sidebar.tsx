"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  Package,
  RefreshCcw,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { Led } from "./te";

const NAV = [
  {
    group: "WORKBENCH / 工作台",
    items: [
      { icon: LayoutDashboard, label: "控制台", href: "/dashboard" },
      { icon: RefreshCcw, label: "订阅", href: "/subscriptions" },
      { icon: Boxes, label: "联合会员", href: "/bundles" },
      { icon: Package, label: "物品", href: "/purchases" },
      { icon: BarChart3, label: "报表", href: "/reports", soon: true },
    ],
  },
  {
    group: "ACCOUNT / 账户",
    items: [
      { icon: Settings, label: "设置", href: "/settings", soon: true },
      { icon: Bell, label: "通知渠道", href: "/settings/channels", soon: true },
      { icon: SquareTerminal, label: "用量脚本", href: "/settings/scripts", soon: true },
    ],
  },
];

export function Sidebar({ username, role }: { username: string; role: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-black bg-[#E4E3E0]">
      <div className="flex h-16 items-center gap-3 border-b border-black px-4">
        <div className="flex h-9 w-9 items-center justify-center bg-black text-base font-bold text-white">
          S.
        </div>
        <div>
          <div className="text-sm font-bold uppercase tracking-wider">Subtrace</div>
          <div className="text-[9px] uppercase tracking-widest text-neutral-500 f-mono">
            subscription field kit
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-5">
            <div className="flex items-center justify-between border-b border-dashed border-neutral-400 px-2 pb-1 text-[9px] uppercase tracking-[0.2em] text-neutral-500 f-mono">
              {g.group}
              <ChevronDown className="h-3 w-3" />
            </div>
            <div className="mt-1.5 space-y-0.5">
              {g.items.map((it) => {
                const active = pathname.startsWith(it.href);
                const cls = `flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium ${
                  active
                    ? "bg-black text-white"
                    : it.soon
                      ? "cursor-not-allowed text-neutral-400"
                      : "text-neutral-700 hover:bg-black/5"
                }`;
                const inner = (
                  <>
                    <it.icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                    {it.label}
                    {it.soon && (
                      <span className="ml-auto text-[8px] uppercase f-mono">soon</span>
                    )}
                  </>
                );
                return it.soon ? (
                  <div key={it.label} className={cls}>{inner}</div>
                ) : (
                  <Link key={it.label} href={it.href} className={cls}>{inner}</Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-black px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center border border-black bg-white text-[10px] font-bold">
            {username.slice(0, 1).toUpperCase()}
          </div>
          <div className="f-mono">
            <div className="text-[11px] font-semibold">{username}</div>
            <div className="flex items-center gap-1 text-[9px] uppercase text-neutral-500">
              <Led color="#22c55e" /> {role.toLowerCase()}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
