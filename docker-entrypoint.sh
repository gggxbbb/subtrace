#!/bin/sh
# 容器启动：先迁移（幂等），再启动 Next standalone 服务器。
# instrumentation 钩子在 server.js 内拉起内置调度（提醒/汇率/脚本对账）。
set -e

export DATABASE_URL="${DATABASE_URL:-file:./data/subtrace.db}"

echo "[subtrace] 应用数据库迁移…"
./node_modules/.bin/prisma migrate deploy

echo "[subtrace] 启动服务器 :${PORT:-3000}"
exec node server.js
