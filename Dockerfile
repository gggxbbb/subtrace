# subtrace 一体化镜像（ADR-0005 单实例）：Next standalone + SQLite + 内置调度
# 构建：docker build -t subtrace .
# 运行：见 docker-compose.yml

# ---- 依赖与构建 ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 无匹配预编译时的兜底编译链（有预编译则不使用）
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

# 网络受限环境可换镜像源：docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com .
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV npm_config_registry=$NPM_REGISTRY

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src
COPY public ./public
COPY next.config.ts tsconfig.json ./
# Prisma client 生成到 src/generated（自定义输出路径），需在构建期产出
RUN pnpm prisma generate && pnpm build

# 迁移工具：npm 平铺安装 prisma CLI（避开 pnpm 符号链接布局）
FROM node:22-bookworm-slim AS migrator
WORKDIR /migrate
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV npm_config_registry=$NPM_REGISTRY
RUN npm install prisma@7.8.0 --omit=dev --no-audit --no-fund

# ---- 运行时 ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# standalone 自包含产物（含 server.js 与裁剪后的 node_modules）
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# 启动时跑迁移：npm 平铺安装的 CLI + schema + migrations（全部收在 /migrate 自洽）
COPY --from=migrator /migrate/node_modules /migrate/node_modules
COPY prisma /migrate/prisma
COPY prisma.config.ts /migrate/prisma.config.ts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p data

EXPOSE 3000
VOLUME ["/app/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
