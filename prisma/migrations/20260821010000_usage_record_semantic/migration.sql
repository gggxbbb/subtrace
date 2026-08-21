-- AlterTable
ALTER TABLE "UsageRecord" ADD COLUMN "semantic" TEXT;

-- 存量打标（ADR-0013 D3）：RESET TOTAL → USED；STACKED TOTAL → REMAINING
UPDATE "UsageRecord" SET "semantic" = 'USED'
WHERE "kind" = 'TOTAL' AND "subscriptionId" IN (
  SELECT "id" FROM "Subscription" WHERE "grantMode" IS NULL OR "grantMode" = 'RESET'
);
UPDATE "UsageRecord" SET "semantic" = 'REMAINING'
WHERE "kind" = 'TOTAL' AND "subscriptionId" IN (
  SELECT "id" FROM "Subscription" WHERE "grantMode" = 'STACKED'
);
