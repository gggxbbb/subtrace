"use client";

// 录入预填（ticket 09）：外币金额失焦时按汇率表预填折算主币种，可手改。
// 约定：仅在金额与币种都有值、且折算框为空（或等于上次自动值）时覆写，不覆盖用户手改。

import { lookupRateAction } from "./actions";

export function attachRatePrefill(form: HTMLFormElement | null): () => void {
  if (!form || form.dataset.ratePrefill) return () => {};
  const amount = form.querySelector<HTMLInputElement>('input[name="amount"]');
  const currency = form.querySelector<HTMLInputElement>('input[name="currency"]');
  const base = form.querySelector<HTMLInputElement>('input[name="amountBase"]');
  if (!amount || !currency || !base) return () => {};
  form.dataset.ratePrefill = "1";

  let lastAuto: number | null = null;
  const fill = async () => {
    const amt = Number(amount.value);
    const cur = currency.value.trim();
    if (!amt || !cur) return;
    // 用户已手改（非空且不等于上次自动值）→ 不打扰
    if (base.value.trim() !== "" && Number(base.value) !== lastAuto) return;
    const rate = await lookupRateAction(cur);
    if (rate === null || rate === 1) {
      // 币种无汇率（或就是主币种）：清掉上次自动值，避免残值被静默提交
      if (lastAuto !== null && base.value === String(lastAuto)) base.value = "";
      lastAuto = null;
      return;
    }
    lastAuto = Math.round(amt * rate * 100) / 100;
    base.value = String(lastAuto);
  };
  amount.addEventListener("blur", fill);
  currency.addEventListener("blur", fill);
  return () => {
    amount.removeEventListener("blur", fill);
    currency.removeEventListener("blur", fill);
    delete form.dataset.ratePrefill;
  };
}
