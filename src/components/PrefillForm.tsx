"use client";

// 带汇率预填的表单容器（ticket 09）：server 页面传 server action 即可。

import { useEffect, useRef } from "react";
import { attachRatePrefill } from "@/lib/exchange/prefill";

export function PrefillForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => attachRatePrefill(ref.current), []);
  return (
    <form ref={ref} action={action} className={className}>
      {children}
    </form>
  );
}
