"use client";

// 步进向导外壳（ui-hardening 07）：步骤条 + 步进状态机。
// 导航行与提交形态各向导差异大（占位/返回、整表提交/末步小表单），保留各自实现。

import { useState } from "react";

/** 步骤条：编号 + 当前（黑底）/已完成（灰底）/未到达（灰字） */
export function StepBar({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div className="flex border-b border-ink">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[10px] uppercase tracking-wider f-mono ${
            i === step ? "bg-ink text-surface" : i < step ? "bg-base" : "bg-surface text-neutral-400"
          }`}
        >
          <span>{i + 1}</span> {s}
        </div>
      ))}
    </div>
  );
}

/** 步进状态机：逐步校验（返回错误消息或 null 放行），前进前回调（采集摘要等） */
export function useStepWizard({
  validate,
  onAdvance,
}: {
  validate?: (step: number) => string | null;
  onAdvance?: (step: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const next = () => {
    const err = validate?.(step) ?? null;
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    onAdvance?.(step);
    setStep(step + 1);
  };

  const back = () => {
    setStepError(null);
    setStep(step - 1);
  };

  return { step, stepError, next, back };
}
