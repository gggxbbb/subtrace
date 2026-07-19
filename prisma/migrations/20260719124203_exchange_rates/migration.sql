-- AlterTable
ALTER TABLE "User" ADD COLUMN "ratesApiUrl" TEXT;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rateToBase" REAL NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'MANUAL',
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_userId_currency_key" ON "ExchangeRate"("userId", "currency");
