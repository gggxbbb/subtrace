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
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
