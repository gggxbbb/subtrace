-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "altUnitPrice" REAL;
ALTER TABLE "Subscription" ADD COLUMN "quotaTotal" REAL;
ALTER TABLE "Subscription" ADD COLUMN "usageKind" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "usageUnit" TEXT;

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DELTA',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
