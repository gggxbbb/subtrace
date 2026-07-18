// 测试全局准备：删除旧测试库并把 schema 推到独立的测试数据库
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function setup() {
  rmSync("data/test.db", { force: true });
  execSync("pnpm exec prisma db push", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./data/test.db" },
  });
}
