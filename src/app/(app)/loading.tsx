// 路由组级 loading：导航期间替代白屏（Next 自动包 Suspense）。
// TE 风格：黑描边白面板 + 脉冲 LED（无光晕）。

import { Led } from "@/components/te";

export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="flex items-center gap-2.5 border border-black bg-white px-4 py-3">
        <span className="animate-pulse">
          <Led />
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 f-mono">
          加载中
        </span>
      </div>
    </div>
  );
}
