ALTER TABLE "UsageReport" ADD COLUMN "leaseId" TEXT;

CREATE UNIQUE INDEX "UsageReport_leaseId_key" ON "UsageReport"("leaseId");
