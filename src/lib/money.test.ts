// 金额解析（ADR-0010）决策树测试：仓储缝，真实测试库。

import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { BadAmountError, NoRateError, resolveMoney } from "./money";
import { upsertRate } from "./exchange/service";

let owner: { id: string; baseCurrency: string };

beforeEach(async () => {
  await prisma.exchangeRate.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  const u = await prisma.user.create({ data: { username: "me", passwordHash: "x" } });
  owner = { id: u.id, baseCurrency: u.baseCurrency };
});

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("resolveMoney 决策树", () => {
  it("同主币种：折算留空按 1:1；币种留空视同主币种", async () => {
    const a = await resolveMoney(fd({ amount: "100", currency: "CNY" }), owner);
    expect(a).toEqual({ amount: 100, currency: "CNY", amountBase: 100 });
    const b = await resolveMoney(fd({ amount: "25.5" }), owner);
    expect(b).toEqual({ amount: 25.5, currency: "CNY", amountBase: 25.5 });
  });

  it("外币手填折算：永远优先，不查汇率表", async () => {
    await upsertRate(owner.id, { currency: "USD", rateToBase: 7.2, mode: "MANUAL" });
    const r = await resolveMoney(fd({ amount: "100", currency: "usd", amountBase: "680" }), owner);
    expect(r).toEqual({ amount: 100, currency: "USD", amountBase: 680 });
  });

  it("外币未手填且有汇率：服务端查表计算，两位小数", async () => {
    await upsertRate(owner.id, { currency: "USD", rateToBase: 7.23, mode: "MANUAL" });
    const r = await resolveMoney(fd({ amount: "33.33", currency: "USD" }), owner);
    expect(r).toEqual({ amount: 33.33, currency: "USD", amountBase: 240.98 });
  });

  it("外币未手填且无汇率：抛 NoRateError（拒绝，不静默 1:1）", async () => {
    const err = await resolveMoney(fd({ amount: "100", currency: "EUR" }), owner).catch((e) => e);
    expect(err).toBeInstanceOf(NoRateError);
    expect((err as NoRateError).code).toBe("fx");
    expect((err as NoRateError).currency).toBe("EUR");
  });

  it("allowUnknown：金额留空输出三 null（ticket 12）；非 allowUnknown 抛 BadAmountError", async () => {
    await expect(resolveMoney(fd({}), owner, { allowUnknown: true })).resolves.toEqual({
      amount: null,
      currency: null,
      amountBase: null,
    });
    await expect(resolveMoney(fd({}), owner)).rejects.toThrow(BadAmountError);
    await expect(resolveMoney(fd({ amount: "abc" }), owner)).rejects.toThrow(BadAmountError);
  });

  it("prefix 与显式 names：同构前缀与非同构命名（标准价）都能解析", async () => {
    await upsertRate(owner.id, { currency: "USD", rateToBase: 7.2, mode: "MANUAL" });
    const a = await resolveMoney(fd({ firstAmount: "10", firstCurrency: "USD", firstAmountBase: "70" }), owner, {
      prefix: "first",
    });
    expect(a).toEqual({ amount: 10, currency: "USD", amountBase: 70 });
    const b = await resolveMoney(fd({ listPrice: "15.99", listCurrency: "USD", listPriceBase: "" }), owner, {
      names: { amount: "listPrice", currency: "listCurrency", amountBase: "listPriceBase" },
    });
    expect(b).toEqual({ amount: 15.99, currency: "USD", amountBase: 115.13 });
  });
});
