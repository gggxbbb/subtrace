// AI 摘要的信号载荷与指纹（ADR-0016）：从 DashboardData 提取引擎已算信号为 JSON-safe
// 结构，稳定序列化（键排序 + 数字定点化）后连同 userId 哈希为指纹，作摘要缓存 key。
// 纯函数模块：不查库、不读 env；展示态字段（rows/entryRows/usageById/trend 原始序列）不进载荷。

import { createHash } from "node:crypto";
import type { DashboardData } from "@/lib/dashboard";

export interface DigestPayload {
  upcoming: Array<{ name: string; daysLeft: number; amount: number | null; auto: boolean }>;
  usageBoard: Array<{
    name: string;
    verdictAmount: number;
    wasteNote: string | null;
    stale: boolean;
    countdown: string | null;
    windowLabel: string;
    quantityLabel: string | null;
    paid: number;
    value: number;
    costUnknown: boolean;
    valueUnknown: boolean;
  }>;
  monthSpent: number;
  yearSpent: number;
  /** 近 30 天支出序列的聚合（总额/均值），不塞原始点 */
  trend: { total: number; average: number };
  purchases: Array<{ name: string; daysHeld: number; progress: number | null; status: string }>;
}

/** 数字定点化（4 位小数）：0.1+0.2 与 0.3 收敛同值，指纹不随浮点尾巴抖动 */
function fixNumber(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(4));
}

export function buildDigestPayload(d: DashboardData): DigestPayload {
  const trendTotal = d.trend.reduce((s, x) => s + x, 0);
  return {
    upcoming: d.upcoming.map((u) => ({
      name: u.name,
      daysLeft: u.daysLeft,
      amount: u.amount,
      auto: u.auto,
    })),
    usageBoard: d.usageBoard.map((r) => ({
      name: r.name,
      verdictAmount: r.verdictAmount,
      wasteNote: r.wasteNote ?? null,
      stale: r.stale ?? false,
      countdown: r.countdown ?? null,
      windowLabel: r.windowLabel,
      quantityLabel: r.quantityLabel,
      paid: r.paid,
      value: r.value,
      costUnknown: r.costUnknown ?? false,
      valueUnknown: r.valueUnknown ?? false,
    })),
    monthSpent: d.monthSpent,
    yearSpent: d.yearSpent,
    trend: {
      total: trendTotal,
      average: d.trend.length === 0 ? 0 : trendTotal / d.trend.length,
    },
    purchases: d.purchases.map((p) => ({
      name: p.name,
      daysHeld: p.daysHeld,
      progress: p.progress ?? null,
      status: p.status,
    })),
  };
}

/** 递归稳定化：对象键排序 + 数字定点化 → JSON.stringify 输出与键插入序无关 */
function stabilize(value: unknown): unknown {
  if (typeof value === "number") return fixNumber(value);
  if (Array.isArray(value)) return value.map(stabilize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stabilize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** 指纹 = sha256(稳定序列化({ userId, payload }))；同一 (payload, userId) 必得同值 */
export function digestFingerprint(payload: DigestPayload, userId: string): string {
  const canonical = JSON.stringify(stabilize({ payload, userId }));
  return createHash("sha256").update(canonical).digest("hex");
}
