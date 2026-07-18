import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Next.js 热重载下避免多实例
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const defaultUrl = `file:${path.resolve("data/subtrace.db").replace(/\\/g, "/")}`;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL ?? defaultUrl,
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
