-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "trackingMode" TEXT NOT NULL,
    "cycleKind" TEXT,
    "cycleUnit" TEXT,
    "cycleCount" INTEGER,
    "fixedDays" INTEGER,
    "anchorDate" DATETIME,
    "listPrice" REAL,
    "listCurrency" TEXT,
    "listPriceBase" REAL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "remindDays" TEXT NOT NULL DEFAULT '[7,3,0]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "amountBase" REAL NOT NULL,
    "refundedBase" REAL NOT NULL DEFAULT 0,
    "paidAt" DATETIME NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
