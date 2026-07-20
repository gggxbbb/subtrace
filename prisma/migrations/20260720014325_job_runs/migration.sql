-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobKey" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT
);

-- CreateIndex
CREATE INDEX "JobRun_jobKey_startedAt_idx" ON "JobRun"("jobKey", "startedAt");
