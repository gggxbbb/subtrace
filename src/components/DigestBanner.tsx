"use client";

// 双态到期 banner（ADR-0016）：模板先行（模板即 loading 态，无 spinner），
// enabled 时挂载后 fetch /api/digest，kind: "digest" 则原地替换为摘要（chip 换「摘要」），
// fallback 保持模板原样。摘要态点击文本区原位展开/收回详细版（不进 URL、不进历史）。

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ORANGE } from "./te";

type Initial =
  | { mode: "digest"; line: string; detail: string }
  | { mode: "template"; text: string; enabled: boolean };

export function DigestBanner({ initial }: { initial: Initial }) {
  const [digest, setDigest] = useState<{ line: string; detail: string } | null>(
    initial.mode === "digest" ? { line: initial.line, detail: initial.detail } : null,
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (initial.mode !== "template" || !initial.enabled) return;
    let cancelled = false;
    fetch("/api/digest")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body || body.kind !== "digest") return;
        setDigest({ line: body.line, detail: body.detail });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const chip = digest ? "摘要" : "待续费";

  return (
    <div className="flex items-center justify-between border border-ink bg-surface px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: ORANGE }} />
        {digest ? (
          expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="点击收回"
              className="whitespace-pre-wrap text-left text-[13px]"
            >
              <span className="mr-2 border border-ink bg-base px-1.5 py-0.5 text-[9px] uppercase tracking-wider f-mono">
                {chip}
              </span>
              {digest.detail}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="点击展开详细版"
              className="truncate text-left text-[13px]"
            >
              <span className="mr-2 border border-ink bg-base px-1.5 py-0.5 text-[9px] uppercase tracking-wider f-mono">
                {chip}
              </span>
              {digest.line}
            </button>
          )
        ) : (
          <span className="truncate text-[13px]">
            <span className="mr-2 border border-ink bg-base px-1.5 py-0.5 text-[9px] uppercase tracking-wider f-mono">
              {chip}
            </span>
            {initial.mode === "template" ? initial.text : ""}
          </span>
        )}
      </div>
      <Link
        href="/subscriptions"
        className="shrink-0 text-[10px] uppercase tracking-wider underline underline-offset-2 f-mono"
      >
        查看全部 →
      </Link>
    </div>
  );
}
