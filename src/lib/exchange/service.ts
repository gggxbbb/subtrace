// 汇率服务（ticket 09）：用户级汇率表（原币→主币种），AUTO 每日 API 刷新 / MANUAL 钉住。
// 折算只用于录入时预填；保存进付费/物品记录的是主币种快照（ADR-0004），此后改汇率不影响历史。

import { prisma } from "../db";

const DEFAULT_API = "https://open.er-api.com/v6/latest/{base}";

export interface RateView {
  id: string;
  currency: string;
  rateToBase: number;
  mode: string; // AUTO | MANUAL
  lastError: string | null;
  updatedAt: Date;
}

export async function listRates(userId: string): Promise<RateView[]> {
  return prisma.exchangeRate.findMany({
    where: { userId },
    orderBy: { currency: "asc" },
  });
}

export async function upsertRate(
  userId: string,
  input: { currency: string; rateToBase: number; mode: "AUTO" | "MANUAL" },
): Promise<void> {
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("币种代码须为 3 位字母 bad_currency");
  if (!(input.rateToBase > 0)) throw new Error("汇率必须为正 bad_rate");
  await prisma.exchangeRate.upsert({
    where: { userId_currency: { userId, currency } },
    create: { userId, currency, rateToBase: input.rateToBase, mode: input.mode },
    update: { rateToBase: input.rateToBase, mode: input.mode, lastError: null },
  });
}

export async function deleteRate(userId: string, rateId: string): Promise<void> {
  await prisma.exchangeRate.deleteMany({ where: { id: rateId, userId } });
}

export async function setBaseCurrency(userId: string, code: string): Promise<void> {
  const currency = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("币种代码须为 3 位字母 bad_currency");
  await prisma.user.update({ where: { id: userId }, data: { baseCurrency: currency } });
}

export async function setRatesApiUrl(userId: string, url: string): Promise<void> {
  const v = url.trim();
  if (v && !v.includes("{base}")) throw new Error("API 模板需包含 {base} 占位 bad_api_url");
  await prisma.user.update({ where: { id: userId }, data: { ratesApiUrl: v || null } });
}

/** 查汇率：1 原币 = N 主币种；主币种本身为 1，未配置为 null */
export async function getRate(userId: string, currency: string): Promise<number | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const cur = currency.trim().toUpperCase();
  if (cur === user.baseCurrency) return 1;
  const row = await prisma.exchangeRate.findUnique({
    where: { userId_currency: { userId, currency: cur } },
  });
  return row?.rateToBase ?? null;
}

type Fetcher = (url: string) => Promise<Record<string, unknown>>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
};

/** 从 API 模板取某原币对主币种的汇率：latest/{原币} 的 rates[主币种] 即 1 原币兑主币种 */
async function fetchRate(
  apiTemplate: string,
  currency: string,
  baseCurrency: string,
  fetcher: Fetcher,
): Promise<number> {
  const url = apiTemplate.replace("{base}", currency);
  const data = await fetcher(url);
  const rates = data?.rates as Record<string, number> | undefined;
  const rate = rates?.[baseCurrency];
  if (typeof rate !== "number" || !(rate > 0)) throw new Error("API 响应缺少目标汇率");
  return rate;
}

export interface RefreshSummary {
  updated: number;
  failed: { currency: string; error: string }[];
}

/** 刷新某用户的全部 AUTO 汇率；失败保留旧值并写 lastError（ticket 09）。fetcher 可注入替身。 */
export async function refreshAutoRates(userId: string, fetcher: Fetcher = defaultFetcher): Promise<RefreshSummary> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const api = user.ratesApiUrl ?? DEFAULT_API;
  const autos = await prisma.exchangeRate.findMany({ where: { userId, mode: "AUTO" } });
  const summary: RefreshSummary = { updated: 0, failed: [] };
  for (const row of autos) {
    try {
      const rate = await fetchRate(api, row.currency, user.baseCurrency, fetcher);
      await prisma.exchangeRate.update({
        where: { id: row.id },
        data: { rateToBase: rate, lastError: null },
      });
      summary.updated += 1;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await prisma.exchangeRate.update({ where: { id: row.id }, data: { lastError: error } });
      summary.failed.push({ currency: row.currency, error });
    }
  }
  return summary;
}

/** 全部用户的 AUTO 汇率刷新（每日调度入口） */
export async function refreshAllAutoRates(fetcher: Fetcher = defaultFetcher): Promise<RefreshSummary> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const total: RefreshSummary = { updated: 0, failed: [] };
  for (const u of users) {
    const r = await refreshAutoRates(u.id, fetcher);
    total.updated += r.updated;
    total.failed.push(...r.failed);
  }
  return total;
}
