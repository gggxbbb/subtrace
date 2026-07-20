// pm2 部署配置（裸机/源码部署，见 README「方式二」）。
// 启动前确保已执行：pnpm install --frozen-lockfile && pnpm build && pnpm prisma migrate deploy
module.exports = {
  apps: [
    {
      name: "subtrace",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      // 单实例约定（ADR-0005）：单进程，内置调度在此进程内运行
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Shanghai",
        HOSTNAME: "0.0.0.0",
        PORT: 3000,
        // CRON_SECRET 与 DATABASE_URL 从 .env 读取（next 自动加载）或在此覆盖
      },
      max_memory_restart: "512M",
    },
  ],
};
