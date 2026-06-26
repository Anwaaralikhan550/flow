import { LeaseStatus, MasterAccountStatus, Prisma, type PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { forbidden, notFound, tooManyRequests } from "../../utils/errors.js";
import { MasterAccountRepository } from "../master-accounts/master-account.repository.js";
import { RoundRobinService } from "../master-accounts/round-robin.service.js";
import { UsageRepository } from "./usage.repository.js";

export type ProviderOutcome =
  | "SUCCESS"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "TRANSIENT_ERROR"
  | "AUTH_INVALID";

type ReportUsageInput = {
  userId: string;
  fingerprintId: string;
  leaseId: string;
  outcome?: ProviderOutcome;
  usageUnits?: number;
  providerStatusCode?: number;
  providerErrorType?: string;
  providerMessage?: string;
  retryAfterSeconds?: number;
};

type ReportUsageResult = {
  outcome: ProviderOutcome;
  accepted: true;
  duplicate?: boolean;
};

export class UsageService {
  private readonly usageRepository: UsageRepository;
  private readonly masterRepository: MasterAccountRepository;
  private readonly roundRobin: RoundRobinService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.usageRepository = new UsageRepository(prisma);
    this.masterRepository = new MasterAccountRepository(prisma);
    this.roundRobin = new RoundRobinService(prisma, redis);
  }

  async reportUsage(input: ReportUsageInput): Promise<ReportUsageResult> {
    const usageUnits = Math.max(1, input.usageUnits ?? 1);
    const lease = await this.resolveLease(input.leaseId);

    if (lease.userId !== input.userId || lease.deviceFingerprintId !== input.fingerprintId) {
      throw forbidden("Lease does not belong to this session", "LEASE_SESSION_MISMATCH");
    }

    const expiresAt = new Date(lease.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await this.expireLease(input.leaseId);
      throw forbidden("Lease has expired", "LEASE_EXPIRED");
    }

    const outcome = this.normalizeOutcome(input);
    const reportData = {
      leaseId: input.leaseId,
      userId: input.userId,
      masterAccountId: lease.masterAccountId,
      deviceFingerprintId: input.fingerprintId,
      outcome,
      usageUnits,
      providerStatusCode: input.providerStatusCode,
      providerErrorType: input.providerErrorType,
      providerMessage: input.providerMessage?.slice(0, 500),
    };

    if (outcome === "SUCCESS") {
      const result = await this.recordSuccessfulUsageOnce(input.leaseId, reportData, usageUnits);
      if (!result.duplicate) {
        await this.resetFailureCount(lease.masterAccountId);
      }
      await this.clearInflightJob(lease.masterAccountId, input.leaseId);
      return result;
    }

    const duplicate = await this.createReportOnce(input.leaseId, reportData);
    if (duplicate) {
      await this.clearInflightJob(lease.masterAccountId, input.leaseId);
      return this.resolveDuplicateReport(duplicate.outcome as ProviderOutcome);
    }

    if (outcome === "RATE_LIMITED") {
      const cooldownSeconds = this.resolveCooldownSeconds(input.retryAfterSeconds);
      await this.applyCooldown(lease.masterAccountId, cooldownSeconds);
      await this.clearInflightJob(lease.masterAccountId, input.leaseId);
      throw tooManyRequests(
        `Provider rate limit detected. Account is cooling down for ${cooldownSeconds} seconds.`,
        "PROVIDER_RATE_LIMITED",
      );
    }

    if (outcome === "QUOTA_EXHAUSTED") {
      await this.masterRepository.markExhausted(lease.masterAccountId);
      await this.roundRobin.removeFromActiveList(lease.masterAccountId);
      await this.clearInflightJob(lease.masterAccountId, input.leaseId);
      return { outcome, accepted: true };
    }

    if (outcome === "AUTH_INVALID") {
      // Use REQUIRES_SYNC instead of AUTH_INVALID for permanent access-denied signals.
      // This flags the account for admin review without terminating active executions
      // on other runners. Round-robin skips it because findLeasableAccounts only
      // returns ACTIVE status accounts.
      await this.masterRepository.markRequiresSync(lease.masterAccountId);
      await this.roundRobin.removeFromActiveList(lease.masterAccountId);
      await this.clearInflightJob(lease.masterAccountId, input.leaseId);
      return { outcome, accepted: true };
    }

    if (outcome === "TRANSIENT_ERROR") {
      await this.applyRepeatedFailureCooldown(lease.masterAccountId);
    }

    await this.clearInflightJob(lease.masterAccountId, input.leaseId);
    return { outcome, accepted: true };
  }

  normalizeOutcome(input: ReportUsageInput): ProviderOutcome {
    if (input.outcome) {
      return input.outcome;
    }

    const statusCode = input.providerStatusCode;
    const errorText = `${input.providerErrorType ?? ""} ${input.providerMessage ?? ""}`.toLowerCase();

    if (statusCode === 429 || errorText.includes("rate limit") || errorText.includes("too many requests")) {
      return "RATE_LIMITED";
    }

    if (
      errorText.includes("quota exceeded") ||
      errorText.includes("insufficient quota") ||
      errorText.includes("daily limit") ||
      errorText.includes("usage limit")
    ) {
      return "QUOTA_EXHAUSTED";
    }

    if (statusCode === 401 || statusCode === 403 || errorText.includes("invalid auth")) {
      return "AUTH_INVALID";
    }

    if (statusCode && statusCode >= 500) {
      return "TRANSIENT_ERROR";
    }

    return "SUCCESS";
  }

  private async resolveLease(leaseId: string) {
    const rawLease = await this.redis.get(`lease:${leaseId}`);
    if (rawLease) {
      return JSON.parse(rawLease) as {
        userId: string;
        masterAccountId: string;
        deviceFingerprintId: string;
        expiresAt: string;
      };
    }

    const lease = await this.prisma.masterAccountLease.findUnique({
      where: { id: leaseId },
    });

    if (!lease || (lease.status !== LeaseStatus.ACTIVE && lease.status !== LeaseStatus.COMPLETED)) {
      throw notFound("Active lease was not found", "LEASE_NOT_FOUND");
    }

    return {
      userId: lease.userId,
      masterAccountId: lease.masterAccountId,
      deviceFingerprintId: lease.deviceFingerprintId,
      expiresAt: lease.expiresAt.toISOString(),
    };
  }

  private async recordSuccessfulUsageOnce(
    leaseId: string,
    reportData: Parameters<UsageRepository["createReport"]>[0],
    usageUnits: number,
  ): Promise<ReportUsageResult> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const usageReport = tx.usageReport as any;
        const existingReport = await usageReport.findUnique({ where: { leaseId } });
        if (existingReport) {
          return {
            duplicate: true,
            outcome: existingReport.outcome as ProviderOutcome,
            remainingLimit: null as number | null,
            masterAccountId: reportData.masterAccountId,
          };
        }

        await usageReport.create({ data: reportData });
        const account = await tx.masterAccount.update({
          where: { id: reportData.masterAccountId },
          data: { remainingLimit: { decrement: usageUnits } },
        });

        if (account.remainingLimit <= 0) {
          await tx.masterAccount.update({
            where: { id: reportData.masterAccountId },
            data: { status: MasterAccountStatus.EXHAUSTED },
          });
        }

        return {
          duplicate: false,
          outcome: reportData.outcome as ProviderOutcome,
          remainingLimit: account.remainingLimit,
          masterAccountId: reportData.masterAccountId,
        };
      });

      if (result.duplicate) {
        return this.resolveDuplicateReport(result.outcome);
      }

      await this.syncRemainingCache(result.masterAccountId, result.remainingLimit);
      if (result.remainingLimit !== null && result.remainingLimit <= 0) {
        await this.roundRobin.removeFromActiveList(result.masterAccountId);
      }

      return { outcome: "SUCCESS", accepted: true };
    } catch (error) {
      const duplicate = await this.findDuplicateReportAfterRace(error, leaseId);
      if (duplicate) {
        return this.resolveDuplicateReport(duplicate.outcome as ProviderOutcome);
      }
      throw error;
    }
  }

  private async createReportOnce(
    leaseId: string,
    reportData: Parameters<UsageRepository["createReport"]>[0],
  ) {
    try {
      return await this.usageRepository.createReport(reportData).then(() => null);
    } catch (error) {
      const duplicate = await this.findDuplicateReportAfterRace(error, leaseId);
      if (duplicate) {
        return duplicate;
      }
      throw error;
    }
  }

  private async resolveDuplicateReport(outcome: ProviderOutcome): Promise<ReportUsageResult> {
    if (outcome === "RATE_LIMITED") {
      throw tooManyRequests("Provider rate limit detected. Duplicate usage report ignored.", "PROVIDER_RATE_LIMITED");
    }

    return { outcome, accepted: true, duplicate: true };
  }

  private async findDuplicateReportAfterRace(error: unknown, leaseId: string) {
    if (!this.isUniqueConstraintError(error)) {
      return null;
    }

    return this.usageRepository.findByLeaseId(leaseId);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") ||
      (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002")
    );
  }

  private async syncRemainingCache(masterAccountId: string, remainingLimit: number | null) {
    if (remainingLimit === null) {
      return;
    }

    const redisRemainingKey = `master:${masterAccountId}:remaining`;
    try {
      const current = await this.redis.get(redisRemainingKey);
      const currentValue = current === null ? Number.POSITIVE_INFINITY : Number(current);
      if (!Number.isFinite(currentValue) || currentValue > remainingLimit) {
        await this.redis.set(redisRemainingKey, Math.max(0, remainingLimit), "EX", 3600);
      }
    } catch {
      // Redis remaining is a cache; the database transaction above is the source of truth.
    }
  }

  private async applyCooldown(masterAccountId: string, cooldownSeconds: number) {
    const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000);
    await this.redis.set(`master:${masterAccountId}:cooldown`, cooldownUntil.toISOString(), "EX", cooldownSeconds);
    await this.masterRepository.markCoolingDown(masterAccountId, cooldownUntil);
    await this.roundRobin.removeFromActiveList(masterAccountId);
  }

  private async applyRepeatedFailureCooldown(masterAccountId: string) {
    const failureKey = `master:${masterAccountId}:failure_count`;
    const failures = await this.redis.incr(failureKey);
    await this.redis.expire(failureKey, 300);

    if (failures < 3) {
      return;
    }

    const cooldownSeconds = Math.min(failures * 10, 60);
    await this.applyCooldown(masterAccountId, cooldownSeconds);
  }

  private async resetFailureCount(masterAccountId: string) {
    try {
      await this.redis.del(`master:${masterAccountId}:failure_count`);
    } catch {
      // Failure counts are advisory; usage idempotency and billing are still enforced by the database.
    }
  }

  private async clearInflightJob(masterAccountId: string, leaseId: string) {
    await this.roundRobin.clearInflightJob(masterAccountId, leaseId).catch(() => undefined);
  }

  private resolveCooldownSeconds(retryAfterSeconds?: number) {
    if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
      return Math.min(Math.ceil(retryAfterSeconds), 3600);
    }

    return env.RATE_LIMIT_COOLDOWN_SECONDS;
  }

  private async expireLease(leaseId: string) {
    await this.redis.del(`lease:${leaseId}`);
    await this.prisma.masterAccountLease
      .update({
        where: { id: leaseId },
        data: { status: LeaseStatus.EXPIRED },
      })
      .catch(() => undefined);
  }
}
