-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "usageCycleUnit" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "usageCycleCount" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "usageCycleAnchor" DATETIME;
