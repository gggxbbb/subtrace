import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署（ADR-0005 单实例）：输出自包含 server.js
  output: "standalone",
  turbopack: {
    // 避免误把上级目录的 package-lock.json 当作 workspace root
    root: __dirname,
  },
};

export default nextConfig;
