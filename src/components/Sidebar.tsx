"use client";

// 导航：桌面侧边栏（≥md）+ 移动端顶栏/抽屉/底部 tab（<md，ADR-0009）。
// NAV 数据与分组渲染为单一来源，两端共用，权限门控（admin/trusted）一致。

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Clock,
  Bell,
  Boxes,
  LayoutDashboard,
  Menu,
  Package,
  RefreshCcw,
  SquareTerminal,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Led } from "./te";

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  soon?: boolean;
  adminOnly?: boolean;
  trustedOnly?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "WORKBENCH / 工作台",
    items: [
      { icon: LayoutDashboard, label: "控制台", href: "/dashboard" },
      { icon: RefreshCcw, label: "订阅", href: "/subscriptions" },
      { icon: Boxes, label: "联合会员", href: "/bundles" },
      { icon: Package, label: "物品", href: "/purchases" },
      { icon: BarChart3, label: "报表", href: "/reports" },
    ],
  },
  {
    group: "SETTINGS / 设置",
    items: [
      { icon: Bell, label: "通知渠道", href: "/settings/channels" },
      { icon: SquareTerminal, label: "用量脚本", href: "/settings/scripts", trustedOnly: true },
      { icon: ArrowLeftRight, label: "汇率", href: "/settings/rates" },
      { icon: Clock, label: "定时任务", href: "/settings/jobs" },
      { icon: Users, label: "用户管理", href: "/settings/users", adminOnly: true },
    ],
  },
];

const WORKBENCH = NAV[0].items;

function visible(items: NavItem[], role: string, canUseScripts: boolean) {
  return items.filter((it) => (!it.adminOnly || role === "ADMIN") && (!it.trustedOnly || canUseScripts));
}

/** 分组导航链接（侧边栏与移动抽屉共用） */
function NavGroups({
  role,
  canUseScripts,
  onNavigate,
}: {
  role: string;
  canUseScripts: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((g) => (
        <div key={g.group} className="mb-5">
          <div className="border-b border-dashed border-neutral-400 px-2 pb-1 text-[9px] uppercase tracking-[0.2em] text-neutral-500 f-mono">
            {g.group}
          </div>
          <div className="mt-1.5 space-y-0.5">
            {visible(g.items, role, canUseScripts).map((it) => {
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
                <Link key={it.label} href={it.href} className={cls} onClick={onNavigate}>{inner}</Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function UserFooter({ username, role }: { username: string; role: string }) {
  return (
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
  );
}

export function Sidebar({ username, role, canUseScripts }: { username: string; role: string; canUseScripts: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-black bg-[#E4E3E0] md:flex">
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
        <NavGroups role={role} canUseScripts={canUseScripts} />
      </nav>
      <UserFooter username={username} role={role} />
    </aside>
  );
}

/** 移动端导航（<md）：顶栏（汉堡）+ 全树抽屉 + 底部 tab（工作台 5 项） */
export function MobileNav({ username, role, canUseScripts }: { username: string; role: string; canUseScripts: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 路由变化自动收起抽屉
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* 顶栏 */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-black bg-[#E4E3E0] px-4 md:hidden">
        <button
          type="button"
          aria-label="打开菜单"
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center border border-black bg-white"
        >
          <Menu className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center bg-black text-xs font-bold text-white">
            S.
          </div>
          <span className="text-sm font-bold uppercase tracking-wider">Subtrace</span>
        </div>
        <span className="w-11" />
      </div>

      {/* 抽屉 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-black bg-[#E4E3E0]">
            <div className="flex h-14 items-center justify-between border-b border-black px-4">
              <span className="text-sm font-bold uppercase tracking-wider">Subtrace</span>
              <button
                type="button"
                aria-label="关闭菜单"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center border border-black bg-white"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <NavGroups role={role} canUseScripts={canUseScripts} onNavigate={() => setOpen(false)} />
            </nav>
            <UserFooter username={username} role={role} />
          </div>
        </div>
      )}

      {/* 底部 tab：工作台 5 项 */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-black bg-[#E4E3E0] md:hidden">
        {WORKBENCH.map((it) => {
          const active = pathname.startsWith(it.href);
          return (
            <Link
              key={it.label}
              href={it.href}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[9px] uppercase tracking-wider f-mono ${
                active ? "bg-black text-white" : "text-neutral-600"
              }`}
            >
              <it.icon className="h-4 w-4" strokeWidth={2.2} />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
