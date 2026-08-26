"use client";

import { useTransition } from "react";
import { quickAddUsageAction } from "@/lib/usage/actions";
import type { UsageTuple } from "@/lib/usage/tuples";

/** 计数型快捷录入（ui-wave-a ticket 02）：≤3 个 tuple 一键按钮，订阅列表与控制台「今日可记」共用。
 *  点击经 server action 写入今日（服务器北京墙钟）DELTA 记录；失败回跳 back?error=quick。
 *  移动端 44px 触控底线，桌面收 compact；flex-wrap 防破版。 */
export function QuickLogButtons({
  subscriptionId,
  tuples,
  unit,
  back,
}: {
  subscriptionId: string;
  tuples: UsageTuple[];
  unit: string | null;
  back: string;
}) {
  const [pending, start] = useTransition();
  if (tuples.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {tuples.map((t) => (
        <button
          key={`${t.quantity}@${t.unitPrice ?? "def"}`}
          type="button"
          disabled={pending}
          title={`记一笔今日用量：${t.quantity} ${unit ?? "次"}`}
          onClick={() =>
            start(() => quickAddUsageAction(subscriptionId, t.quantity, t.unitPrice, back))
          }
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center border border-ink bg-surface px-2 py-0.5 text-[10px] uppercase f-mono hover:bg-ink hover:text-surface disabled:opacity-40 md:min-h-0 md:min-w-0"
        >
          +{t.quantity} {unit ?? "次"}
          {t.unitPrice != null ? ` @ ${t.unitPrice}` : ""}
        </button>
      ))}
    </span>
  );
}
