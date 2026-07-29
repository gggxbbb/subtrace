"use client";

// 收益表单字段共享模块（ui-hardening 06）：PurchaseIncomePanel 快捷新增与
// IncomesManager 新增/编辑三处共用；表单外壳（边框/按钮/back）各留本地。
// 布局差异（日期栏宽度、来源标签文案）经 props 参数化，渲染与原版逐像素一致。

import { inputCls, labelCls } from "@/components/te";
import { MoneyFields } from "@/components/MoneyFields";
import { isoDay } from "@/lib/dates";

const today = () => isoDay(new Date());

/** 收益表单字段：金额三件套 + 日期 + 来源（不含外壳与按钮） */
export function IncomeFormFields({
  defaults,
  currency,
  dateFlex = false,
  noteOptional = false,
}: {
  defaults?: { amount?: number | null; currency?: string | null; amountBase?: number | null; date?: string; note?: string | null };
  currency: string;
  /** 日期栏与来源栏同宽（详情页快捷表单）；默认日期栏定宽（管理页） */
  dateFlex?: boolean;
  /** 来源标签为「来源（可选）」带占位（新增形态）；默认「来源」（编辑形态） */
  noteOptional?: boolean;
}) {
  return (
    <>
      <MoneyFields
        layout="inline"
        defaults={{
          amount: defaults?.amount,
          currency: defaults?.currency ?? currency,
          amountBase: defaults?.amountBase,
        }}
      />
      <div className={dateFlex ? "flex-1" : undefined}>
        <label className={labelCls}>日期</label>
        <input name="date" type="date" defaultValue={defaults?.date ?? today()} required className={`${inputCls} f-mono`} />
      </div>
      <div className="flex-1">
        <label className={labelCls}>{noteOptional ? "来源（可选）" : "来源"}</label>
        <input
          name="note"
          defaultValue={defaults?.note ?? ""}
          placeholder={noteOptional ? "出租 3 天 / 返利" : undefined}
          className={inputCls}
        />
      </div>
    </>
  );
}
