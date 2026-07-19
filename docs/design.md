# subtrace 设计文档

类 Wallos 的个人开支追踪：周期性订阅（含联合会员、手动续费、活动价）与一次性物品的日均成本、用量盈亏。自部署多用户。

技术栈：Next.js（App Router）+ TypeScript + Prisma + SQLite，Tailwind + shadcn/ui，图表用 Recharts。认证：用户名 + argon2 密码哈希 + session cookie，邀请制（首个注册用户为管理员）。

术语以 `CONTEXT.md` 为准；关键取舍见 `docs/adr/`。

## 数据模型（Prisma 草案）

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  role         Role     @default(USER)      // 首个用户为 ADMIN
  baseCurrency String   @default("CNY")     // 主币种
  createdAt    DateTime @default(now())

  subscriptions Subscription[]              // 拥有的订阅
  bundles       Bundle[]
  purchases     Purchase[]
  shares        Share[]                     // 作为受益人
  usageRecords  UsageRecord[]
  exchangeRates ExchangeRate[]
  channels      NotifyChannel[]
  invites       Invite[]                    // 我发出的邀请
}

enum Role { ADMIN USER }

model Invite {                              // 邀请制注册
  token     String   @id
  creatorId String
  creator   User     @relation(fields: [creatorId], references: [id])
  usedById  String?
  expiresAt DateTime
}

model Subscription {
  id           String       @id @default(cuid())
  ownerId      String
  owner        User         @relation(fields: [ownerId], references: [id])
  name         String
  category     String?
  trackingMode TrackingMode

  // 周期模式字段（手动模式为 null）
  cycleKind     CycleKind?  // CALENDAR | FIXED_DAYS
  cycleUnit     CycleUnit?  // DAY WEEK MONTH YEAR（CALENDAR 时）
  cycleCount    Int?        // 每 N 个单位
  fixedDays     Int?        // FIXED_DAYS 时
  anchorDate    DateTime?   // 锚定日期，付费记录可改写
  listPrice     Decimal?    // 标准价（原币）
  listCurrency  String?
  listPriceBase Decimal?    // 标准价主币种快照（未记账周期计成本用）

  autoRenew    Boolean  @default(true)
  remindDays   String   @default("[7,3,0]") // JSON 数组，到期前 N 天提醒
  status       SubStatus @default(ACTIVE)   // ACTIVE | CANCELLED（到期即止）| ARCHIVED
  startDate    DateTime

  bundleId String?                          // 所属联合会员（新建子会员时）
  bundle   Bundle?  @relation(fields: [bundleId], references: [id])
  // 归属关系主要挂在 Payment.bundleId：已有订阅被关联进联合会员时，
  // 向其追加 source=BUNDLE 的付费记录（同一订阅可多次参与）

  // 用量盈亏（可量化订阅）
  usageUnit    String?                      // 次 / 小时 / GB
  altUnitPrice Decimal?                     // 替代单价（主币种）
  usageScript  UsageScript?

  payments Payment[]
  shares   Share[]
  usage    UsageRecord[]
}

enum TrackingMode { CYCLE MANUAL }
enum CycleKind { CALENDAR FIXED_DAYS }
enum CycleUnit { DAY WEEK MONTH YEAR }
enum SubStatus { ACTIVE CANCELLED ARCHIVED }

model Payment {                             // 付费记录（一等实体）
  id             String   @id @default(cuid())
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  amount         Decimal    // 实付（原币）
  currency       String
  amountBase     Decimal    // 主币种快照
  refundedBase   Decimal  @default(0) // 退款（主币种），成本按净额
  paidAt         DateTime
  periodStart    DateTime   // 服务区间 [start, end)
  periodEnd      DateTime   // = 到期日的唯一事实源
  source         PaySource  // AUTO | MANUAL | PROMO | BUNDLE
  bundleId       String?    // BUNDLE 来源时指向联合会员（已有订阅被关联时也是这条路径）
  bundle         Bundle?  @relation(fields: [bundleId], references: [id])
  note           String?
}

enum PaySource { AUTO MANUAL PROMO BUNDLE }

model Bundle {                              // 联合会员：一笔打包付费
  id              String   @id @default(cuid())
  ownerId         String
  owner           User     @relation(fields: [ownerId], references: [id])
  name            String
  totalAmount     Decimal  // 打包实付（原币）
  currency        String
  totalAmountBase Decimal  // 主币种快照
  periodStart     DateTime
  periodEnd       DateTime
  items           Subscription[]
  // 创建时按各子会员 listPrice 比例把 totalAmountBase 分摊，
  // 为每个子会员物化一条 source=BUNDLE 的 Payment（金额可手改）
}

model Share {                               // 受益人分摊（查询时切片）
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  userId         String
  user           User   @relation(fields: [userId], references: [id])
  weight         Float  @default(1)         // 改权重全局重算
  @@id([subscriptionId, userId])
}

model UsageRecord {
  id             String   @id @default(cuid())
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  userId         String     // 谁用的（盈亏按人算）
  user           User   @relation(fields: [userId], references: [id])
  date           DateTime
  quantity       Decimal
  source         UsageSource // MANUAL | SCRIPT
}

enum UsageSource { MANUAL SCRIPT }

model UsageScript {                          // 用户自定义用量同步脚本
  subscriptionId String   @id
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  code           String      // JS，沙箱执行，返回当前周期用量
  cron           String   @default("0 6 * * *")
  lastRunAt      DateTime?
  lastError      String?
}

model Purchase {                             // 物品
  id           String   @id @default(cuid())
  ownerId      String
  owner        User     @relation(fields: [ownerId], references: [id])
  name         String
  category     String?
  amount       Decimal
  currency     String
  amountBase   Decimal   // 主币种快照
  purchaseDate DateTime
  expectedDays Int?      // 预期寿命（回本模型）
  status       PurchaseStatus @default(IN_USE) // IN_USE | RETIRED | SOLD
  endDate      DateTime? // 报废/卖出日期
  resaleBase   Decimal?  // 残值（主币种）
}

enum PurchaseStatus { IN_USE RETIRED SOLD }

model ExchangeRate {                         // 仅用于录入时预填
  userId   String
  user     User   @relation(fields: [userId], references: [id])
  currency String
  rate     Decimal  // 1 外币 = rate 主币种
  mode     RateMode // AUTO（定时拉取）| MANUAL（钉住）
  updatedAt DateTime @updatedAt
  @@id([userId, currency])
}

enum RateMode { AUTO MANUAL }

model NotifyChannel {
  id      String  @id @default(cuid())
  userId  String
  user    User    @relation(fields: [userId], references: [id])
  type    ChannelType // WEBHOOK | EMAIL
  target  String      // webhook URL / 邮箱地址
  enabled Boolean @default(true)
}

enum ChannelType { WEBHOOK EMAIL }
```

## 计算引擎（全部基于主币种快照，查询时实时计算）

统一抽象：**成本段 (cost segment)** = `{ 净额, 起, 止 }`，日费率 = 净额 / (止 − 起) 天数。

- **订阅的成本段**：每条付费记录生成一段（净额 = amountBase − refundedBase）；周期模式下，付费记录未覆盖的推算区间按 listPriceBase 补齐合成段。
- **到期日** = max(periodEnd)；无付费记录时 = 锚定日期 + k×周期 中第一个 ≥ 今天的日期。
- **物品的成本段**：`{ amountBase − resaleBase, 购买日, 止 }`，止 = 卖出/报废日；否则有预期寿命且未超期 → 购买日 + expectedDays（固定费率）；超期或未定寿命 → 今天（费率随时间递减）。
- **我的当日总日均** = Σ 活跃订阅当日费率 × 我的权重占比 + Σ 持有物品当日费率。
- **盈亏（按服务区间、按人）**：价值 = 我的 Σ用量 × altUnitPrice；成本 = 该区段净额 × 我的权重占比；盈亏 = 价值 − 成本。每次实际成本 = 成本 / 我的用量。
- **聚合**：月度/年度报表把成本段按天切片到目标区间求和。

## 页面（App Router）

| 路由 | 内容 |
|---|---|
| `/login` `/register` | 登录；注册仅接受邀请 token（首个用户开放并设为 ADMIN） |
| `/dashboard` | 当日总日均、本月支出、未来 30 天到期列表、盈亏红黑榜 |
| `/subscriptions` | 列表：名称、到期日、当前费率、状态；新建/编辑（模式、周期、提醒天数、受益人） |
| `/subscriptions/[id]` | 到期时间线、付费历史（记一笔/退款）、用量录入与图表、按人盈亏 |
| `/bundles` | 联合会员向导：打包价 → 子会员（原价）→ 分摊预览 → 物化付费记录 |
| `/purchases` | 物品列表：持有天数、当日费率、回本进度；卖出/报废登记 |
| `/reports` | 月度/年度支出、分类占比、趋势 |
| `/settings` | 主币种、汇率表（自动/手动）、通知渠道、用量脚本、邀请管理（ADMIN） |

## 后台任务

- **提醒**：每日扫描到期日 − remindDays 命中当天的订阅，向用户启用的渠道投递（Webhook POST / SMTP 邮件）。
- **汇率**：每日更新 mode=AUTO 的币对（免费汇率 API，可配置源）。
- **用量脚本**：按 cron 在 `node:vm` 沙箱中执行用户脚本（受限 fetch、无 require、超时熔断），结果写入 UsageRecord。⚠️ 沙箱不是强安全边界，多用户部署时只对信任用户开放脚本功能。

## 暂不做

数据导入（手动重录）；OAuth 登录；开放注册；移动端原生 App（响应式 Web 够用）。
