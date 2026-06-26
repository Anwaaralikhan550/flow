-- AlterEnum
ALTER TYPE "MasterAccountStatus" ADD VALUE 'REQUIRES_SYNC';

-- AlterTable
ALTER TABLE "MasterAccount" ADD COLUMN     "proxyHost" TEXT,
ADD COLUMN     "proxyPassword" TEXT,
ADD COLUMN     "proxyPort" INTEGER,
ADD COLUMN     "proxyUsername" TEXT;
