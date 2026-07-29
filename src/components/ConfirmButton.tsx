"use client";

// 两步删除确认（ui-hardening 08）：第一击进入确认态（确认/算了），替代 native confirm()。
// 样式经 className 系列 props 保持各调用点原有视觉。

import { useState } from "react";

export function ConfirmButton({
  onConfirm,
  label = "删除",
  confirmLabel = "确认删除",
  cancelLabel = "算了",
  className = "",
  confirmClassName = "bg-red-700 px-2 py-0.5 text-[9px] uppercase text-white f-mono hover:bg-red-800",
  cancelClassName = "border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono hover:bg-black hover:text-white",
}: {
  onConfirm: () => void | Promise<void>;
  label?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 第一击按钮（红描边警示态） */
  className?: string;
  /** 确认态主按钮（实心红） */
  confirmClassName?: string;
  /** 确认态取消按钮 */
  cancelClassName?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <>
        <button onClick={onConfirm} className={confirmClassName}>
          {confirmLabel}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={cancelClassName}>
          {cancelLabel}
        </button>
      </>
    );
  }
  return (
    <button type="button" onClick={() => setConfirming(true)} className={className}>
      {label}
    </button>
  );
}
