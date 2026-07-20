-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "script" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "scriptCron" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "scriptEnv" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "baseCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "ratesApiUrl" TEXT,
    "canUseScripts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("baseCurrency", "createdAt", "id", "passwordHash", "ratesApiUrl", "role", "username") SELECT "baseCurrency", "createdAt", "id", "passwordHash", "ratesApiUrl", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
