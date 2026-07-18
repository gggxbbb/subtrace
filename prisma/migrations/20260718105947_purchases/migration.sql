-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "amountBase" REAL NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "expectedDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'IN_USE',
    "endDate" DATETIME,
    "resaleBase" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Purchase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
