import { LeaseStatus, type PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { decryptCookie } from "../../config/crypto.js";
import { badRequest, forbidden, notFound } from "../../utils/errors.js";
import { RoundRobinService } from "./round-robin.service.js";

export class MasterAccountService {
  private readonly roundRobin: RoundRobinService;
  private readonly retryAfterMs = 1500;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.roundRobin = new RoundRobinService(prisma, redis);
  }

  async leaseAccount(params: { userId: string; fingerprintId: string }) {
    const account = await this.roundRobin.nextAccount();
    if (!account) {
      await this.redis.set(
        `session:wait:${params.userId}:${params.fingerprintId}`,
        "1",
        "EX",
        Math.max(1, Math.ceil(this.retryAfterMs / 1000)),
      );

      return {
        available: false,
        retryAfterMs: this.retryAfterMs,
        message: "Preparing session...",
      };
    }

    let vaultData: string;
    if (account.encryptedCookie && account.cookieNonce) {
      try {
        vaultData = decryptCookie({
          ciphertext: account.encryptedCookie,
          nonce: account.cookieNonce,
        });
      } catch (e) {
        await this.redis.del(`master:${account.id}:lock`);
        throw badRequest("Failed to securely retrieve master account credentials", "VAULT_DECRYPTION_ERROR");
      }
    } else {
      await this.redis.del(`master:${account.id}:lock`);
      throw badRequest("Master account is missing secure credentials", "VAULT_MISSING_CREDENTIALS");
    }

    const expiresAt = new Date(Date.now() + env.LEASE_TTL_SECONDS * 1000);
    let lease: { id: string } | null = null;

    try {
      lease = await this.prisma.masterAccountLease.create({
        data: {
          userId: params.userId,
          masterAccountId: account.id,
          deviceFingerprintId: params.fingerprintId,
          status: LeaseStatus.ACTIVE,
          expiresAt,
        },
      });

      await this.prisma.masterAccount.update({
        where: { id: account.id },
        data: { lastUsedAt: new Date() },
      });

      await this.redis.set(
        `lease:${lease.id}`,
        JSON.stringify({
          userId: params.userId,
          masterAccountId: account.id,
          deviceFingerprintId: params.fingerprintId,
          expiresAt: expiresAt.toISOString(),
        }),
        "EX",
        env.LEASE_TTL_SECONDS,
      );

      return {
        available: true,
        leaseId: lease.id,
        provider: account.provider,
        expiresAt: expiresAt.toISOString(),
        remainingLimit: account.remainingLimit,
        vaultVersion: account.vaultVersion,
        vaultData,
        // Proxy metadata is returned only when configured on this account.
        // The extension uses it to anchor all concurrent runners on the same
        // static edge IP via a PAC script scoped to target-platform domains.
        proxy: account.proxyHost
          ? {
              host: account.proxyHost,
              port: account.proxyPort ?? 8080,
              username: account.proxyUsername ?? undefined,
              password: account.proxyPassword ?? undefined,
            }
          : null,
      };
    } catch (error) {
      const keys = [`master:${account.id}:lock`];
      if (lease?.id) {
        keys.push(`lease:${lease.id}`);
        await this.prisma.masterAccountLease
          .update({
            where: { id: lease.id },
            data: { status: LeaseStatus.CANCELLED },
          })
          .catch(() => undefined);
      }
      await this.redis.del(...keys).catch(() => undefined);
      throw error;
    }
  }

  async releaseAccount(leaseId: string, params: { userId: string; submitted?: boolean }) {
    const dbLease = await this.prisma.masterAccountLease.findUnique({
      where: { id: leaseId },
    });
    const leaseData = await this.redis.get(`lease:${leaseId}`);
    if (!leaseData && !dbLease) {
      throw notFound("Active lease was not found", "LEASE_NOT_FOUND");
    }

    let lease: { userId?: string; masterAccountId?: string };
    try {
      lease = leaseData
        ? JSON.parse(leaseData)
        : {
            userId: dbLease?.userId,
            masterAccountId: dbLease?.masterAccountId,
          };
    } catch (e) {
      if (!dbLease) {
        throw badRequest("Active lease data is invalid", "LEASE_CACHE_INVALID");
      }

      lease = {
        userId: dbLease.userId,
        masterAccountId: dbLease.masterAccountId,
      };
    }

    if (lease.userId !== params.userId) {
      throw forbidden("Lease does not belong to this session", "LEASE_SESSION_MISMATCH");
    }

    if (!lease.masterAccountId) {
      throw badRequest("Active lease is missing master account metadata", "LEASE_CACHE_INVALID");
    }

    await this.prisma.masterAccountLease.updateMany({
      where: {
        id: leaseId,
        userId: params.userId,
        status: LeaseStatus.ACTIVE,
      },
      data: {
        status: LeaseStatus.COMPLETED,
      },
    });

    if (params.submitted) {
      await this.roundRobin.markInflightJob(lease.masterAccountId, leaseId);
      await this.roundRobin.bufferReleasedLock(lease.masterAccountId);
      await this.redis.del(`lease:${leaseId}`);
      return;
    }

    await this.redis.del(`master:${lease.masterAccountId}:lock`, `lease:${leaseId}`);
  }
}
