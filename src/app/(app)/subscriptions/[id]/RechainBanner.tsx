"use client";

import { rechainPaymentsAction } from "@/lib/subscriptions/actions";

/** 链式重排提示：编辑/删除付费后链断裂时，提议后续记录平移保持连续 */
export function RechainBanner({
  subscriptionId,
  shiftCount,
  deltaDays,
  back,
}: {
  subscriptionId: string;
  /** 受影响的后续记录数 */
  shiftCount: number;
  /** 位移天数（负=前移） */
  deltaDays: number;
  back?: string;
}) {
  const direction = deltaDays < 0 ? `前移 ${-deltaDays} 天` : `后移 ${deltaDays} 天`;
  return (
    <div className="flex items-center justify-between border border-ink bg-accent px-4 py-2.5 text-[12px] text-white">
      <span>
        付费区间不再连续——后续 <strong>{shiftCount}</strong> 笔记录是否{direction}保持无缝衔接？
      </span>
      <span className="flex items-center gap-2">
        <button
          onClick={async () => rechainPaymentsAction(subscriptionId, back)}
          className="bg-surface px-3 py-1 text-[10px] font-semibold uppercase text-ink hover:bg-neutral-200"
        >
          自动调整 →
        </button>
        <a
          href={back ? `/subscriptions/${subscriptionId}/payments?${back}` : `/subscriptions/${subscriptionId}`}
          className="border border-white px-3 py-1 text-[10px] uppercase hover:bg-surface hover:text-ink"
        >
          忽略
        </a>
      </span>
    </div>
  );
}
