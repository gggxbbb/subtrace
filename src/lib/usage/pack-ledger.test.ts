// 额度包 FEFO 推演引擎测试缝（纯函数模块，无 DB/框架依赖）。
// 每条测试对应 ADR-0012 / spec.md Implementation Decisions 中的一条可观察规则。

import { describe, expect, it } from "vitest";
import {
  projectPackLedger,
  type PackInput,
  type RemainingSnapshot,
} from "./pack-ledger";

const d = (s: string) => new Date(`${s}T00:00:00+08:00`);

const pack = (over: Partial<PackInput> = {}): PackInput => ({
  grantedAt: d("2026-01-01"),
  quantity: 30,
  expiresAt: d("2026-06-01"),
  source: "AUTO",
  ...over,
});

const snap = (date: string, remaining: number): RemainingSnapshot => ({
  date: d(date),
  remaining,
});

/** 统一单张成本 2；赠送包零成本由调用方回调表达 */
const flatCost = () => 2;

describe("FEFO 宽厚假设拆分（ADR-0012：窗口内消费先于到期）", () => {
  it("消耗按先到期先扣：先到期的包被优先消耗，到期只浪费 FEFO 模拟余额", () => {
    const packs = [
      pack({ expiresAt: d("2026-03-01") }), // A：先到期
      pack({ expiresAt: d("2026-06-01") }), // B：后到期
    ];
    const result = projectPackLedger({
      packs,
      snapshots: [snap("2026-01-10", 50), snap("2026-04-01", 15)],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    // 首快照校准：Σ60 − 50 = 10 计消费，FEFO 先扣 A → A:20, B:30
    // 窗口 (01-10, 04-01]：D = 50 − 15 = 35；A 于 03-01 到期，烧掉模拟余额 20 计浪费；
    // 其余 15 计消费（宽厚：若保守先扣 B，A 会留 30 全烧，浪费被高估）
    expect(result.waste).toEqual([{ date: d("2026-03-01"), quantity: 20, amount: 40 }]);
    expect(result.consumptionInferred).toBe(25); // 10 + 15
    expect(result.balance).toBe(15);
    expect(result.balanceAt).toEqual(d("2026-04-01"));
    expect(result.nextExpiry).toEqual({
      date: d("2026-06-01"),
      quantity: 30,
      projectedBalance: 15,
    });
  });
});

describe("快照校准吸收误差", () => {
  it("剩余无发放回升时被校准吸收（不冲减累计消费），下一窗口从校准值起算", () => {
    const packs = [
      pack({ expiresAt: d("2026-06-01") }),
      pack({ expiresAt: d("2026-09-01") }),
      pack({ expiresAt: d("2026-12-01") }),
    ];
    const result = projectPackLedger({
      packs,
      snapshots: [
        snap("2026-01-15", 90), // Σ=90，无漂移
        snap("2026-02-15", 70), // D=20 计消费（FEFO 扣 A）
        snap("2026-03-15", 80), // 回升 10：误差/未建模赠送，校准吸收
        snap("2026-05-15", 60), // D 从校准值 80 起算 = 20 计消费
      ],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    expect(result.consumptionInferred).toBe(40); // 20 + 20，回升不冲减
    expect(result.balance).toBe(60);
    expect(result.waste).toEqual([]);
  });
});

describe("包到期排他边界（到期日当天起不可用）", () => {
  const packs = () => [
    pack({ expiresAt: d("2026-06-01") }),
    pack({ expiresAt: d("2026-09-01") }),
  ];

  it("到期日前一天的快照：包仍存活，进入到期预警", () => {
    const result = projectPackLedger({
      packs: packs(),
      snapshots: [snap("2026-05-01", 50), snap("2026-05-31", 45)],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    // 首校准漂移 10 FEFO 扣 A → A:20；窗口 D=5 再扣 A → A:15, B:30
    expect(result.waste).toEqual([]);
    expect(result.nextExpiry).toEqual({
      date: d("2026-06-01"),
      quantity: 30,
      projectedBalance: 15,
    });
  });

  it("到期日当天的快照：包已在窗口内焚毁（排他）", () => {
    const result = projectPackLedger({
      packs: packs(),
      snapshots: [snap("2026-05-01", 50), snap("2026-06-01", 30)],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    // A 于 06-01 到期（窗口含端点）：烧掉 20；D=20 全部归浪费，消费 0；B 留 30
    expect(result.waste).toEqual([{ date: d("2026-06-01"), quantity: 20, amount: 40 }]);
    expect(result.consumptionInferred).toBe(10);
    expect(result.balance).toBe(30);
    expect(result.nextExpiry).toEqual({
      date: d("2026-09-01"),
      quantity: 30,
      projectedBalance: 30,
    });
  });
});

describe("停订即焚（订阅到期日现场截断）", () => {
  const packs = () => [
    pack({ expiresAt: d("2027-01-01") }),
    pack({ expiresAt: d("2027-02-01") }),
  ];
  const snapshots = () => [snap("2026-05-01", 50), snap("2026-06-15", 0)];

  it("订阅终止日截断包到期日，全部余额在终止日确认为浪费", () => {
    const result = projectPackLedger({
      packs: packs(),
      snapshots: snapshots(),
      subscriptionExpiry: d("2026-06-01"),
      unitCostOf: flatCost,
    });
    // 有效到期日 = min(2027-xx, 2026-06-01) = 06-01；两包余额 20+30=50 全烧在终止日
    expect(result.waste).toEqual([{ date: d("2026-06-01"), quantity: 50, amount: 100 }]);
    expect(result.consumptionInferred).toBe(10); // 仅首快照校准漂移
    expect(result.balance).toBe(0);
    expect(result.nextExpiry).toBeNull();
  });

  it("续费复活：同一包列表改 subscriptionExpiry 重算，浪费消失、结果不同", () => {
    const result = projectPackLedger({
      packs: packs(),
      snapshots: snapshots(),
      subscriptionExpiry: d("2027-06-01"), // 续费到 2027-06-01
      unitCostOf: flatCost,
    });
    // 包按原到期日存活：窗口 D=50 全部计消费（FEFO 扣光 A:20、B:30）
    expect(result.waste).toEqual([]);
    expect(result.consumptionInferred).toBe(60); // 10 + 50
    expect(result.balance).toBe(0);
    expect(result.nextExpiry).toEqual({
      date: d("2027-01-01"),
      quantity: 30,
      projectedBalance: 0,
    });
  });
});

describe("赠送包零成本", () => {
  it("MANUAL 包到期只记数量浪费、金额为零", () => {
    const result = projectPackLedger({
      packs: [
        pack({ expiresAt: d("2026-03-01") }), // AUTO 30 张
        pack({ quantity: 10, expiresAt: d("2026-02-01"), source: "MANUAL" }), // 赠送 10 张
      ],
      snapshots: [snap("2026-01-10", 40), snap("2026-03-15", 0)],
      subscriptionExpiry: null,
      unitCostOf: (p) => (p.source === "MANUAL" ? 0 : 2),
    });
    expect(result.waste).toEqual([
      { date: d("2026-02-01"), quantity: 10, amount: 0 }, // 数量浪费 > 0，金额 = 0
      { date: d("2026-03-01"), quantity: 30, amount: 60 },
    ]);
    expect(result.consumptionInferred).toBe(0);
  });
});

describe("AUTO 单张成本按发放段计价（unitCostOf 回调语义）", () => {
  it("不同发放段的包按各自的单张成本计浪费金额", () => {
    const result = projectPackLedger({
      packs: [
        pack({ quantity: 10, grantedAt: d("2026-01-01"), expiresAt: d("2026-04-01") }),
        pack({ quantity: 10, grantedAt: d("2026-02-01"), expiresAt: d("2026-05-01") }),
      ],
      snapshots: [snap("2026-03-01", 20), snap("2026-06-01", 0)],
      subscriptionExpiry: null,
      // 回调按包的发放段返回不同单价（1 月段净额 2 元/张，2 月段 3 元/张）
      unitCostOf: (p) => (p.grantedAt.getTime() === d("2026-01-01").getTime() ? 2 : 3),
    });
    expect(result.waste).toEqual([
      { date: d("2026-04-01"), quantity: 10, amount: 20 },
      { date: d("2026-05-01"), quantity: 10, amount: 30 },
    ]);
  });
});

describe("边界：空快照与空包", () => {
  it("只有包无快照：无可校准，全部输出为空账", () => {
    const result = projectPackLedger({
      packs: [pack()],
      snapshots: [],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    expect(result).toEqual({
      balanceAt: null,
      balance: 0,
      nextExpiry: null,
      consumptionInferred: 0,
      waste: [],
    });
  });

  it("只有快照无包：余额取最新快照，无消费无浪费", () => {
    const result = projectPackLedger({
      packs: [],
      snapshots: [snap("2026-01-01", 25), snap("2026-02-01", 20)],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    expect(result).toEqual({
      balanceAt: d("2026-02-01"),
      balance: 20,
      nextExpiry: null,
      consumptionInferred: 0,
      waste: [],
    });
  });

  it("包与快照皆空：空账", () => {
    const result = projectPackLedger({
      packs: [],
      snapshots: [],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    expect(result).toEqual({
      balanceAt: null,
      balance: 0,
      nextExpiry: null,
      consumptionInferred: 0,
      waste: [],
    });
  });

  it("快照乱序输入按日期排序后推演（防御性）", () => {
    const asc = projectPackLedger({
      packs: [pack({ expiresAt: d("2026-03-01") }), pack({ expiresAt: d("2026-06-01") })],
      snapshots: [snap("2026-01-10", 50), snap("2026-04-01", 15)],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    const shuffled = projectPackLedger({
      packs: [pack({ expiresAt: d("2026-06-01") }), pack({ expiresAt: d("2026-03-01") })],
      snapshots: [snap("2026-04-01", 15), snap("2026-01-10", 50)],
      subscriptionExpiry: null,
      unitCostOf: flatCost,
    });
    expect(shuffled).toEqual(asc);
  });
});
