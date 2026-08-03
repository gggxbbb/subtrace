-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "grantMode" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "packValidMonths" INTEGER;

-- CreateTable
CREATE TABLE "QuotaPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotaPack_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuotaPack_subscriptionId_grantedAt_idx" ON "QuotaPack"("subscriptionId", "grantedAt");
