import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "subtrace",
    template: "%s · subtrace",
  },
  description: "订阅与物品开支追踪：周期性订阅、联合会员、一次性物品的日均成本与用量盈亏。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 主题（dark-mode 01）：首帧前按 localStorage「theme」（light|dark|system）+ 系统媒体查询
  // 设置 dark class，防闪烁；「系统」设置页的三态切换与此共用同一存储键。
  const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()`;
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
