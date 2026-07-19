"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "通知渠道", href: "/settings/channels" },
  { label: "用量脚本", href: "/settings/scripts" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-px border border-black bg-black">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-[10px] uppercase tracking-wider f-mono ${
              active ? "bg-black text-white" : "bg-white hover:bg-black/5"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
