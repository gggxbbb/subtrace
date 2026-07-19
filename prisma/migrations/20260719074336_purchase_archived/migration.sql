-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
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
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Purchase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("amount", "amountBase", "category", "createdAt", "currency", "endDate", "expectedDays", "id", "name", "ownerId", "purchaseDate", "resaleBase", "status") SELECT "amount", "amountBase", "category", "createdAt", "currency", "endDate", "expectedDays", "id", "name", "ownerId", "purchaseDate", "resaleBase", "status" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
