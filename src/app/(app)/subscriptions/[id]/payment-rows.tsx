"use client";

// 付费记录行共享模块（ui-hardening 06）：行类型、金额展示、编辑表单字段、展示行。
// PaymentHistory（详情页内嵌）与 PaymentsManager（管理页）共用；
// 两处的布局差异经 variant/showPaidAt 参数化，渲染与各自原版逐像素一致。

import { Led, inputCls, labelCls } from "@/components/te";
import { ConfirmButton } from "@/components/ConfirmButton";
import { fmtMoney } from "@/lib/format";
import { MoneyFields } from "@/components/MoneyFields";
import { isoDay } from "@/lib/dates";

export interface PaymentRow {
  id: string;
  /** null = 金额未知（ticket 12） */
  amount: number | null;
  currency: string | null;
  amountBase: number | null;
  refundedBase: number;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  source: string;
  note: string | null;
}

export const SOURCE_LABEL: Record<string, string> = {
  AUTO: "自动扣费",
  MANUAL: "手动续费",
  PROMO: "活动价",
  BUNDLE: "联合会员",
};

const today = () => isoDay(new Date());

/** 金额块：净额展示 / 退款明细 / 金额未知徽标 */
export function PaymentAmount({ p, currency }: { p: PaymentRow; currency: string }) {
  return (
    <div className="text-[13px] font-medium">
      {p.amountBase !== null ? (
        <>
          {fmtMoney(p.amountBase, currency)}
          {p.refundedBase > 0 && (
            <span className="ml-2 text-[10px] text-neutral-400 f-mono">
              退 {fmtMoney(p.refundedBase, currency)} · 净 {fmtMoney(p.amountBase - p.refundedBase, currency)}
            </span>
          )}
        </>
      ) : (
        <span className="inline-block border border-dashed border-neutral-400 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-neutral-400 f-mono">
          金额未知
        </span>
      )}
    </div>
  );
}

/** 编辑表单字段：panel = 详情页三列布局；manager = 管理页四列布局（含新增默认值） */
export function PaymentEditFields({
  row,
  defaultCurrency,
  variant,
}: {
  row?: PaymentRow;
  defaultCurrency: string;
  variant: "panel" | "manager";
}) {
  const money = (
    <MoneyFields
      allowUnknown
      defaults={{
        amount: row?.amount,
        currency: row?.currency ?? defaultCurrency,
        amountBase: row?.amountBase,
      }}
      labels={{ amount: "实付" }}
    />
  );
  const sourceSelect = (
    <div>
      <label className={labelCls}>来源</label>
      <select name="source" defaultValue={row?.source ?? "MANUAL"} className={inputCls}>
        <option value="AUTO">自动扣费</option>
        <option value="MANUAL">手动续费</option>
        <option value="PROMO">活动价</option>
        <option value="BUNDLE">联合会员</option>
      </select>
    </div>
  );

  if (variant === "panel") {
    return (
      <>
        {money}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>支付日期</label>
            <input name="paidAt" type="date" defaultValue={row?.paidAt} required className={`${inputCls} f-mono`} />
          </div>
          <div>
            <label className={labelCls}>服务起</label>
            <input name="periodStart" type="date" defaultValue={row?.periodStart} required className={`${inputCls} f-mono`} />
          </div>
          <div>
            <label className={labelCls}>服务止</label>
            <input name="periodEnd" type="date" defaultValue={row?.periodEnd} required className={`${inputCls} f-mono`} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {sourceSelect}
          <div>
            <label className={labelCls}>退款金额</label>
            <input name="refundedBase" type="number" step="0.01" min="0" defaultValue={row?.refundedBase || undefined} placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>备注</label>
            <input name="note" defaultValue={row?.note ?? ""} className={inputCls} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {money}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>支付日期</label>
          <input name="paidAt" type="date" defaultValue={row?.paidAt ?? today()} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>服务起</label>
          <input name="periodStart" type="date" defaultValue={row?.periodStart ?? today()} required className={`${inputCls} f-mono`} />
        </div>
        <div>
          <label className={labelCls}>服务止</label>
          <input name="periodEnd" type="date" defaultValue={row?.periodEnd} required className={`${inputCls} f-mono`} />
        </div>
        {sourceSelect}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>退款</label>
          <input name="refundedBase" type="number" step="0.01" min="0" defaultValue={row?.refundedBase ?? 0} className={inputCls} />
        </div>
        <div className="col-span-3">
          <label className={labelCls}>备注</label>
          <input name="note" defaultValue={row?.note ?? ""} className={inputCls} />
        </div>
      </div>
    </>
  );
}

/** 展示行：金额块 + 元信息行 + 操作区 + 来源 LED。showPaidAt 控制元信息是否带支付日期 */
export function PaymentRowDisplay({
  p,
  currency,
  showPaidAt,
  canEdit,
  onEdit,
  onDelete,
}: {
  p: PaymentRow;
  currency: string;
  showPaidAt: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 last:border-0">
      <div>
        <PaymentAmount p={p} currency={currency} />
        <div className="text-[9px] uppercase tracking-wider text-neutral-400 f-mono">
          {showPaidAt ? `支付 ${p.paidAt} · ` : ""}
          {p.periodStart} → {p.periodEnd} · {SOURCE_LABEL[p.source] ?? p.source}
          {p.note ? ` · ${p.note}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canEdit && (
          <>
            <button
              onClick={onEdit}
              className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase f-mono group-hover:visible hover:bg-black hover:text-white"
            >
              编辑
            </button>
            <ConfirmButton
              onConfirm={onDelete}
              className="invisible border border-black bg-white px-2 py-0.5 text-[9px] uppercase text-red-700 f-mono group-hover:visible hover:bg-red-700 hover:text-white"
            />
          </>
        )}
        <Led color={p.source === "PROMO" ? "#FF5A00" : "#22c55e"} />
      </div>
    </div>
  );
}
