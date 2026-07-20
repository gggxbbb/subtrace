# subtrace

订阅与物品开支追踪（类 Wallos）：周期性订阅（联合会员、手动续费、活动价、金额未知的存量记录）、一次性物品的回本摊销、可量化订阅的用量盈亏，全站统一北京时间。自部署单实例（Docker 或 pm2），SQLite 单文件库，内置每日调度（到期提醒 / 汇率刷新 / 用量脚本）。

## 快速开始（Docker，推荐）

```bash
docker run -d --name subtrace \
  -p 3000:3000 \
  -e CRON_SECRET=<openssl rand -hex 24> \
  -v subtrace-data:/app/data \
  ghcr.io/gggxbbb/subtrace:latest
```

或用 compose（仓库自带 `docker-compose.yml`，把 `build: .` 注释换成 `image:` 行）：

```bash
echo "CRON_SECRET=$(openssl rand -hex 24)" > .env
docker compose up -d
```

启动时自动应用数据库迁移。打开 `http://<host>:3000/register` 注册——**首个用户即 ADMIN**，之后凭邀请链接注册。

### 镜像通道

| 通道 | 标签 | 说明 |
|---|---|---|
| 正式 | `:latest` / `:1.2.3` / `:1.2` / `:1` | 打 `v*.*.*` 标签触发 |
| 开发 | `:dev` / `:dev-<sha>` | main 分支每次提交 |

均为多架构（amd64 + arm64，树莓派/NAS 可直接跑）。

### 自行构建镜像

```bash
docker build -t subtrace .
# 网络受限换大陆 npm 镜像：
docker build -t subtrace --build-arg NPM_REGISTRY=https://registry.npmmirror.com .
```

## 方式二：源码 + pm2

```bash
git clone https://github.com/gggxbbb/subtrace.git && cd subtrace
corepack enable && pnpm install --frozen-lockfile

echo 'DATABASE_URL="file:./data/subtrace.db"' > .env
echo "CRON_SECRET=$(openssl rand -hex 24)" >> .env

pnpm build
pnpm prisma migrate deploy

pm2 start ecosystem.config.cjs
pm2 save && pm2 startup   # 开机自启
```

升级：`git pull && pnpm install --frozen-lockfile && pnpm build && pnpm prisma migrate deploy && pm2 restart subtrace`

## 环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `CRON_SECRET` | ✓ | — | 外部 cron 触发 `/api/cron/*` 的 Bearer 密钥 |
| `DATABASE_URL` | | `file:./data/subtrace.db` | SQLite 路径（Docker 内默认 `file:/app/data/subtrace.db`） |
| `REMINDER_SCHEDULER` | | 开 | 置 `off` 关闭内置调度（多实例时只留一个开） |
| `HOSTNAME` | | `0.0.0.0` | 监听地址（本机调试可设 `127.0.0.1`） |
| `PORT` | | `3000` | 监听端口 |

## 自动化说明

- **内置调度**（无需配置）：到期提醒扫描与汇率刷新每日北京时间运行、用量脚本按各自 cron 运行；`/settings/jobs` 可查看全部任务与运行记录。
- **外部 cron**（可选，高频或内置关闭时）：
  - `POST /api/cron/reminders` — 每日系统任务（提醒+汇率）
  - `POST /api/cron/scripts?minutes=15` — 用量脚本（分钟级）
  - 均带 `Authorization: Bearer $CRON_SECRET`

## 备份与升级

- **备份**：拷走 SQLite 文件（Docker 卷里的 `subtrace.db`，pm2 部署在 `./data/`）。
- **升级**：换镜像标签重启容器，或 pm2 路径按上方升级命令——迁移自动应用。

## 开发

```bash
pnpm install && pnpm dev          # http://localhost:3000
pnpm test                         # vitest（仓储缝测试，独立测试库）
pnpm prisma migrate dev           # 改 schema 后生成迁移
```

领域约定见 `CONTEXT.md`（术语）与 `docs/adr/`（关键决策）。
