-- AlterTable
ALTER TABLE "MasterAccount" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MasterAccount_deletedAt_idx" ON "MasterAccount"("deletedAt");
