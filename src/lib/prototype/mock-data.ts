// PROTOTYPE ONLY — throwaway mock data for the dashboard UI variants.
// Shape mirrors docs/design.md (cost engine outputs, base-currency snapshots).

export type SubscriptionHealth = {
  id: string;
  name: string;
  category: string;
  icon: string; // emoji placeholder
  expiryDate: string; // ISO date — 到期日（付费记录驱动）
  daysUntilExpiry: number;
  dailyCost: number; // 当日费率（主币种）
  monthlyCost: number;
  cycleLabel: string; // e.g. "年付" "月付"
  sharedWith?: string[]; // 受益人
  usage?: {
    unit: string; // 次 / 小时
    used: number;
    altUnitPrice: number; // 替代单价
    actualCostPerUse: number; // 每次实际成本
    periodNetCost: number; // 本区间已摊成本
    value: number; // 用量 × 替代单价
    verdict: number; // 价值 − 成本（正=赚，负=亏）
  };
};

export type PurchaseHealth = {
  id: string;
  name: string;
  icon: string;
  purchaseDate: string;
  amount: number;
  daysHeld: number;
  dailyCost: number; // 回本模型当前费率
  expectedDays?: number;
  breakevenProgress?: number; // 0..1，已摊/金额
  status: "IN_USE" | "RETIRED" | "SOLD";
};

export type UpcomingRenewal = {
  id: string;
  name: string;
  icon: string;
  date: string;
  daysLeft: number;
  amount: number;
  auto: boolean; // 自动扣费 or 需要手动续
};

export type DashboardData = {
  today: string;
  baseCurrency: string;
  totalDailyCost: number; // 当日总日均
  totalMonthlyCost: number; // 折算月均
  monthSpent: number; // 本月已发生支出
  yearSpent: number;
  subscriptions: SubscriptionHealth[];
  purchases: PurchaseHealth[];
  upcoming: UpcomingRenewal[];
  // 红黑榜：用量盈亏排序后的可量化订阅
  usageBoard: { name: string; icon: string; verdict: number; detail: string }[];
  // 近 30 天每日支出（主币种）
  spendingTrend: number[];
};

export const dashboardData: DashboardData = {
  today: "2026-07-18",
  baseCurrency: "CNY",
  totalDailyCost: 14.73,
  totalMonthlyCost: 447.9,
  monthSpent: 386.0,
  yearSpent: 4823.5,
  subscriptions: [
    {
      id: "s1",
      name: "哔哩哔哩大会员",
      category: "视频",
      icon: "📺",
      expiryDate: "2027-01-22",
      daysUntilExpiry: 188,
      dailyCost: 0.29,
      monthlyCost: 8.9,
      cycleLabel: "年付",
      sharedWith: ["爱人"],
    },
    {
      id: "s2",
      name: "Kimi Code",
      category: "开发",
      icon: "🤖",
      expiryDate: "2026-08-01",
      daysUntilExpiry: 14,
      dailyCost: 3.29,
      monthlyCost: 99.0,
      cycleLabel: "月付",
      usage: {
        unit: "小时",
        used: 61.5,
        altUnitPrice: 12,
        actualCostPerUse: 1.61,
        periodNetCost: 99,
        value: 738,
        verdict: 639,
      },
    },
    {
      id: "s3",
      name: "百度网盘 SVIP",
      category: "工具",
      icon: "☁️",
      expiryDate: "2026-11-05",
      daysUntilExpiry: 110,
      dailyCost: 0.54,
      monthlyCost: 16.4,
      cycleLabel: "年付",
    },
    {
      id: "s4",
      name: "健身房年卡",
      category: "健康",
      icon: "🏋️",
      expiryDate: "2027-03-10",
      daysUntilExpiry: 235,
      dailyCost: 3.56,
      monthlyCost: 108.2,
      cycleLabel: "年付",
      sharedWith: ["爱人"],
      usage: {
        unit: "次",
        used: 9,
        altUnitPrice: 30,
        actualCostPerUse: 24.1,
        periodNetCost: 217,
        value: 270,
        verdict: 53,
      },
    },
    {
      id: "s5",
      name: "88VIP（优酷分摊）",
      category: "视频",
      icon: "🎬",
      expiryDate: "2026-10-01",
      daysUntilExpiry: 75,
      dailyCost: 0.11,
      monthlyCost: 3.3,
      cycleLabel: "年付",
      usage: {
        unit: "小时",
        used: 0,
        altUnitPrice: 0,
        actualCostPerUse: 0,
        periodNetCost: 40,
        value: 0,
        verdict: -40,
      },
    },
    {
      id: "s6",
      name: "iCloud+ 200GB",
      category: "工具",
      icon: "🍎",
      expiryDate: "2026-07-25",
      daysUntilExpiry: 7,
      dailyCost: 0.69,
      monthlyCost: 21.0,
      cycleLabel: "月付",
    },
  ],
  purchases: [
    {
      id: "p1",
      name: "MacBook Pro 14",
      icon: "💻",
      purchaseDate: "2024-11-02",
      amount: 14999,
      daysHeld: 624,
      dailyCost: 5.75,
      expectedDays: 1825,
      breakevenProgress: 0.34,
      status: "IN_USE",
    },
    {
      id: "p2",
      name: "索尼 WH-1000XM5",
      icon: "🎧",
      purchaseDate: "2025-06-15",
      amount: 2299,
      daysHeld: 398,
      dailyCost: 3.14,
      expectedDays: 730,
      breakevenProgress: 0.55,
      status: "IN_USE",
    },
    {
      id: "p3",
      name: "升降桌",
      icon: "🪑",
      purchaseDate: "2023-04-20",
      amount: 1800,
      daysHeld: 1185,
      dailyCost: 1.52,
      status: "IN_USE",
    },
  ],
  upcoming: [
    { id: "u1", name: "iCloud+ 200GB", icon: "🍎", date: "2026-07-25", daysLeft: 7, amount: 21, auto: true },
    { id: "u2", name: "Kimi Code", icon: "🤖", date: "2026-08-01", daysLeft: 14, amount: 99, auto: true },
    { id: "u3", name: "88VIP（优酷分摊）", icon: "🎬", date: "2026-10-01", daysLeft: 75, amount: 88, auto: false },
  ],
  usageBoard: [
    { name: "Kimi Code", icon: "🤖", verdict: 639, detail: "61.5 小时 × ¥12 − ¥99" },
    { name: "健身房年卡", icon: "🏋️", verdict: 53, detail: "9 次 × ¥30 − ¥217" },
    { name: "88VIP（优酷分摊）", icon: "🎬", verdict: -40, detail: "0 使用，净亏分摊额" },
  ],
  spendingTrend: [
    12.4, 11.8, 13.1, 12.9, 14.2, 15.8, 13.6, 12.2, 11.9, 13.4, 14.8, 16.2,
    13.1, 12.6, 11.5, 13.9, 14.4, 15.1, 16.8, 14.2, 13.3, 12.1, 11.7, 13.8,
    14.6, 15.9, 13.2, 12.8, 14.1, 14.73,
  ],
};

export const fmt = (n: number) =>
  n.toLocaleString("zh-CN", { style: "currency", currency: "CNY" });
