import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // 避免误把上级目录的 package-lock.json 当作 workspace root
    root: __dirname,
  },
};

export default nextConfig;
