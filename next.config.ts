import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// 版本戳（构建期烙入）：版本号取 package.json；git hash 优先环境注入（Docker/CI，
// 容器构建无 .git），否则本地 git；构建时刻为当前时间。经 env 内联进产物。
const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };
const gitHash =
  process.env.GIT_HASH ??
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      return "unknown";
    }
  })();

const nextConfig: NextConfig = {
  // Docker 部署（ADR-0005 单实例）：输出自包含 server.js
  output: "standalone",
  turbopack: {
    // 避免误把上级目录的 package-lock.json 当作 workspace root
    root: __dirname,
  },
  env: {
    APP_VERSION: version,
    APP_GIT_HASH: gitHash.slice(0, 7),
    APP_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
