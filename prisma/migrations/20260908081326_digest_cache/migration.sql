-- CreateTable
CREATE TABLE "DigestCache" (
    "fingerprint" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
