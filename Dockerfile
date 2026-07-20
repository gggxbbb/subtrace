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

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src
COPY public ./public
COPY next.config.ts tsconfig.json ./
# Prisma client 生成到 src/generated（自定义输出路径），需在构建期产出
RUN pnpm prisma generate && pnpm build

# ---- 运行时 ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# standalone 自包含产物（含 server.js 与裁剪后的 node_modules）
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# 启动时跑迁移：prisma CLI + schema + migrations
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p data

EXPOSE 3000
VOLUME ["/app/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
