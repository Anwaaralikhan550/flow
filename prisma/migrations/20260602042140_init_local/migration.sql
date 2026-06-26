-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('BASIC', 'PRO', 'ULTRA');

-- CreateEnum
CREATE TYPE "MasterAccountStatus" AS ENUM ('ACTIVE', 'COOLING_DOWN', 'EXHAUSTED', 'AUTH_INVALID', 'DISABLED');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "plan" "PlanType" NOT NULL DEFAULT 'BASIC',
    "validUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isManuallyDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdByAdminId" TEXT,
    "creditsLimit" INTEGER NOT NULL DEFAULT 20,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "encryptedCookie" TEXT NOT NULL,
    "cookieNonce" TEXT NOT NULL,
    "status" "MasterAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "dailyLimit" INTEGER NOT NULL,
    "remainingLimit" INTEGER NOT NULL,
    "cooldownUntil" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterAccountLease" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "masterAccountId" TEXT NOT NULL,
    "deviceFingerprintId" TEXT NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "leasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterAccountLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "masterAccountId" TEXT NOT NULL,
    "deviceFingerprintId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "usageUnits" INTEGER NOT NULL DEFAULT 1,
    "providerStatusCode" INTEGER,
    "providerErrorType" TEXT,
    "providerMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanConfig" (
    "id" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL,
    "creditsLimit" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_plan_idx" ON "User"("plan");

-- CreateIndex
CREATE INDEX "User_validUntil_idx" ON "User"("validUntil");

-- CreateIndex
CREATE INDEX "User_role_validUntil_idx" ON "User"("role", "validUntil");

-- CreateIndex
CREATE INDEX "User_isManuallyDisabled_idx" ON "User"("isManuallyDisabled");

-- CreateIndex
CREATE INDEX "User_role_validUntil_isManuallyDisabled_idx" ON "User"("role", "validUntil", "isManuallyDisabled");

-- CreateIndex
CREATE INDEX "User_createdByAdminId_idx" ON "User"("createdByAdminId");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_fingerprintId_key" ON "Device"("userId", "fingerprintId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterAccount_email_key" ON "MasterAccount"("email");

-- CreateIndex
CREATE INDEX "MasterAccount_status_remainingLimit_idx" ON "MasterAccount"("status", "remainingLimit");

-- CreateIndex
CREATE INDEX "MasterAccount_cooldownUntil_idx" ON "MasterAccount"("cooldownUntil");

-- CreateIndex
CREATE INDEX "MasterAccountLease_userId_status_idx" ON "MasterAccountLease"("userId", "status");

-- CreateIndex
CREATE INDEX "MasterAccountLease_masterAccountId_status_idx" ON "MasterAccountLease"("masterAccountId", "status");

-- CreateIndex
CREATE INDEX "MasterAccountLease_expiresAt_idx" ON "MasterAccountLease"("expiresAt");

-- CreateIndex
CREATE INDEX "UsageReport_userId_createdAt_idx" ON "UsageReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageReport_masterAccountId_createdAt_idx" ON "UsageReport"("masterAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageReport_outcome_idx" ON "UsageReport"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "PlanConfig_plan_key" ON "PlanConfig"("plan");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterAccountLease" ADD CONSTRAINT "MasterAccountLease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterAccountLease" ADD CONSTRAINT "MasterAccountLease_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "MasterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageReport" ADD CONSTRAINT "UsageReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageReport" ADD CONSTRAINT "UsageReport_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "MasterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
