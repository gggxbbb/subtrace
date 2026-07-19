// 仓储缝测试：汇率服务（ticket 09）。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  getRate,
  listRates,
  refreshAutoRates,
  setBaseCurrency,
  setRatesApiUrl,
  upsertRate,
} from "./service";

let ownerId: string;

beforeEach(async () => {
  await prisma.exchangeRate.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  ownerId = (await prisma.user.create({ data: { username: "me", passwordHash: "x" } })).id;
});

describe("汇率表 CRUD", () => {
  it("upsert 归一大写、校验格式；重复币种覆盖", async () => {
    await upsertRate(ownerId, { currency: "usd", rateToBase: 7.2, mode: "MANUAL" });
    expect((await listRates(ownerId))[0]).toMatchObject({ currency: "USD", rateToBase: 7.2 });
    await upsertRate(ownerId, { currency: "USD", rateToBase: 7.3, mode: "AUTO" });
    const rates = await listRates(ownerId);
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({ rateToBase: 7.3, mode: "AUTO" });
    await expect(upsertRate(ownerId, { currency: "US", rateToBase: 1, mode: "MANUAL" })).rejects.toThrow(/币种/);
    await expect(upsertRate(ownerId, { currency: "JPY", rateToBase: 0, mode: "MANUAL" })).rejects.toThrow(/正/);
  });

  it("getRate：主币种为 1，未配置为 null", async () => {
    await upsertRate(ownerId, { currency: "USD", rateToBase: 7.2, mode: "MANUAL" });
    expect(await getRate(ownerId, "CNY")).toBe(1);
    expect(await getRate(ownerId, "usd")).toBe(7.2);
    expect(await getRate(ownerId, "EUR")).toBeNull();
  });

  it("主币种与 API 模板设置校验", async () => {
    await setBaseCurrency(ownerId, "USD");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).baseCurrency).toBe("USD");
    await expect(setRatesApiUrl(ownerId, "https://x/no-placeholder")).rejects.toThrow(/\{base\}/);
    await setRatesApiUrl(ownerId, "https://api.example/{base}");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).ratesApiUrl).toBe(
      "https://api.example/{base}",
    );
  });
});

describe("AUTO 刷新", () => {
  const okFetcher = async (url: string) => {
    if (url.includes("/USD")) return { rates: { CNY: 7.25 } };
    if (url.includes("/JPY")) return { rates: { CNY: 0.048 } };
    throw new Error(`意外请求 ${url}`);
  };

  it("AUTO 项按 API 更新并清错误；MANUAL 项不动", async () => {
    await upsertRate(ownerId, { currency: "USD", rateToBase: 7.0, mode: "AUTO" });
    await upsertRate(ownerId, { currency: "JPY", rateToBase: 0.05, mode: "AUTO" });
    await upsertRate(ownerId, { currency: "HKD", rateToBase: 0.92, mode: "MANUAL" });
    const r = await refreshAutoRates(ownerId, okFetcher);
    expect(r).toEqual({ updated: 2, failed: [] });
    const rates = await listRates(ownerId);
    expect(rates.find((x) => x.currency === "USD")?.rateToBase).toBe(7.25);
    expect(rates.find((x) => x.currency === "JPY")?.rateToBase).toBe(0.048);
    expect(rates.find((x) => x.currency === "HKD")?.rateToBase).toBe(0.92);
  });

  it("失败保留旧值并写 lastError；下次成功清除", async () => {
    await upsertRate(ownerId, { currency: "USD", rateToBase: 7.0, mode: "AUTO" });
    const fail = await refreshAutoRates(ownerId, async () => {
      throw new Error("网络不可达");
    });
    expect(fail.failed).toEqual([{ currency: "USD", error: "网络不可达" }]);
    let row = (await listRates(ownerId))[0];
    expect(row).toMatchObject({ rateToBase: 7.0, lastError: "网络不可达" });

    const ok = await refreshAutoRates(ownerId, okFetcher);
    expect(ok.updated).toBe(1);
    row = (await listRates(ownerId))[0];
    expect(row).toMatchObject({ rateToBase: 7.25, lastError: null });
  });

  it("API 响应缺目标汇率视为失败", async () => {
    await upsertRate(ownerId, { currency: "USD", rateToBase: 7.0, mode: "AUTO" });
    const r = await refreshAutoRates(ownerId, async () => ({ rates: { EUR: 0.9 } }));
    expect(r.failed[0].currency).toBe("USD");
  });
});
