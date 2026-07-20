#!/bin/sh
# 容器启动：先迁移（幂等），再启动 Next standalone 服务器。
# instrumentation 钩子在 server.js 内拉起内置调度（提醒/汇率/脚本对账）。
set -e

# 绝对路径：迁移（/migrate）与服务器（/app）工作目录不同，相对路径会指到两个库
export DATABASE_URL="${DATABASE_URL:-file:/app/data/subtrace.db}"

echo "[subtrace] 应用数据库迁移…"
(cd /migrate && node node_modules/prisma/build/index.js migrate deploy)

echo "[subtrace] 启动服务器 :${PORT:-3000}"
exec node server.js
