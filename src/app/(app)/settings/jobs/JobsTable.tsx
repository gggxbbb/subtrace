"use client";

import { useTransition } from "react";
import { Led } from "@/components/te";
import Link from "next/link";
import { runJobNowAction } from "@/lib/jobs/actions";

export interface JobRow {
  key: string;
  title: string;
  cron: string;
  link: string;
  nextRun: string | null;
  lastRun: { startedAt: string; durationMs: number; status: string; message: string | null } | null;
}

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const [pending, start] = useTransition();

  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-[13px]">
      <thead>
        <tr className="border-b border-ink text-left text-[9px] uppercase tracking-[0.15em] text-neutral-500 f-mono">
          <th className="px-4 py-2 font-medium">任务</th>
          <th className="px-4 py-2 font-medium">cron（北京时间）</th>
          <th className="px-4 py-2 font-medium">下次运行</th>
          <th className="px-4 py-2 font-medium">上次运行</th>
          <th className="px-4 py-2 font-medium">消息</th>
          <th className="px-4 py-2 text-right font-medium">操作</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.key} className="border-b border-neutral-200 last:border-0 hover:bg-black/[0.03]">
            <td className="px-4 py-2.5">
              <Link href={j.link} className="font-medium hover:underline">
                {j.title}
              </Link>
              <span className="ml-1.5 text-[9px] text-neutral-400 f-mono">{j.key}</span>
            </td>
            <td className="px-4 py-2.5 text-[11px] text-neutral-500 f-mono">{j.cron}</td>
            <td className="px-4 py-2.5 text-[11px] tabular-nums text-neutral-500 f-mono">
              {j.nextRun ?? "—"}
            </td>
            <td className="px-4 py-2.5">
              {j.lastRun ? (
                <span className="flex items-center gap-1.5 text-[11px] f-mono">
                  <Led color={j.lastRun.status === "OK" ? "#22c55e" : "#ef4444"} />
                  {j.lastRun.startedAt} · {j.lastRun.durationMs}ms
                </span>
              ) : (
                <span className="text-[11px] text-neutral-400 f-mono">从未运行</span>
              )}
            </td>
            <td className="max-w-56 truncate px-4 py-2.5 text-[10px] text-neutral-500 f-mono" title={j.lastRun?.message ?? ""}>
              {j.lastRun?.message || "—"}
            </td>
            <td className="px-4 py-2.5 text-right">
              <button
                disabled={pending}
                onClick={() => start(() => runJobNowAction(j.key))}
                className="border border-ink bg-surface px-2.5 py-1 text-[9px] uppercase tracking-wider f-mono hover:bg-ink hover:text-surface disabled:opacity-40"
              >
                立即运行
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
