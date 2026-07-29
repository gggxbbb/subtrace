"use client";

import { deleteBundleAction, setBundleArchivedAction } from "@/lib/bundles/actions";
import { ConfirmButton } from "@/components/ConfirmButton";

const btnCls =
  "border border-ink bg-surface px-2 py-0.5 text-[9px] uppercase f-mono hover:bg-ink hover:text-surface";

/** 联合会员标题行操作：编辑 / 归档 / 删除（二次确认） */
export function BundleRowActions({ bundleId, archived }: { bundleId: string; archived: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <a href={`/bundles/${bundleId}/edit`} className={btnCls}>
        编辑 →
      </a>
      <button onClick={async () => setBundleArchivedAction(bundleId, !archived)} className={`${btnCls} text-neutral-500`}>
        {archived ? "取消归档" : "归档"}
      </button>
      <ConfirmButton
        onConfirm={async () => deleteBundleAction(bundleId)}
        className="border border-red-700 bg-surface px-2 py-0.5 text-[9px] uppercase text-red-700 f-mono hover:bg-red-700 hover:text-white"
        cancelClassName={btnCls}
      />
    </span>
  );
}
