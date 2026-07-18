import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // 仓储缝测试共享同一个测试库，禁止文件级并行避免互相清表
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./data/test.db",
    },
    globalSetup: ["./src/test/global-setup.ts"],
  },
});
