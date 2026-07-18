# Subtrace

订阅与物品开支追踪（类 Wallos）：记录周期性订阅、实际付费、联合会员、一次性物品，计算日均成本与用量盈亏。自部署、多用户、Teenage Engineering 风味 UI。

## 特性

- **记录驱动的到期日**：每次真实付费（自动扣款、手动续费、活动价、退款）都记录金额与服务区间，到期日永远来自最后一笔付费记录，未记账时按周期推算兜底
- **双跟踪模式**：周期模式（推算为主、记账修正锚点）/ 手动模式（只记金额与到期日，适合时长不定的会员）
- **联合会员**：打包价按子会员原价比例分摊，子会员是完整订阅（独立到期日、用量、盈亏）
- **物品回本模型**：预期寿命内固定费率，超期摊至今日，卖出/报废扣残值
- **用量盈亏**：用量 × 替代单价 − 已摊成本，支持手动录入与用户脚本定时从 API 同步（如 coding plan）
- **共享订阅**：单一实体按受益人权重分摊，用量与盈亏按人独立计算
- **多币种**：录入时按汇率（自动/手动）快照固化主币种金额，历史不随汇率漂移
- **提醒**：到期前 N 天经站内 / Webhook / 邮件通知

## 技术栈

Next.js（App Router）+ TypeScript + Prisma + SQLite，Tailwind v4，lucide-react（界面图标）+ simple-icons（品牌 logo），fontsource 本地字体（Space Grotesk / IBM Plex Mono）。

## 开发

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

测试：`pnpm test`（Vitest，成本引擎纯函数 + Prisma 仓储层）

## 项目文档

- `CONTEXT.md` — 领域术语表（命名以此为准）
- `docs/design.md` — 设计文档（schema、计算引擎口径、页面）
- `docs/adr/` — 架构决策记录
- `.scratch/subtrace-v1/` — spec 与实现 tickets（本地 issue 追踪，见 `docs/agents/issue-tracker.md`）

## License

[MIT](./LICENSE)
