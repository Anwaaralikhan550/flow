import { type MasterAccount, MasterAccountStatus, type PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";

export class MasterAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async activateExpiredCooldowns(now = new Date()) {
    await this.prisma.masterAccount.updateMany({
      where: {
        status: MasterAccountStatus.COOLING_DOWN,
        cooldownUntil: {
          lte: now,
        },
        remainingLimit: {
          gt: 0,
        },
      },
      data: {
        status: MasterAccountStatus.ACTIVE,
        cooldownUntil: null,
      },
    });
  }

  findLeasableAccounts() {
    const vaultFreshAfter = new Date(Date.now() - env.MASTER_VAULT_MAX_AGE_SECONDS * 1000);

    return this.prisma.masterAccount.findMany({
      where: {
        status: MasterAccountStatus.ACTIVE,
        deletedAt: null,
        remainingLimit: {
          gt: 0,
        },
        encryptedCookie: {
          not: "",
        },
        cookieNonce: {
          not: "",
        },
        vaultHealth: "COMPLETE",
        lastVaultSyncAt: {
          gte: vaultFreshAfter,
        },
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lt: new Date() } }],
      },
      orderBy: [{ lastUsedAt: "asc" }, { createdAt: "asc" }],
    });
  }

  findById(id: string) {
    return this.prisma.masterAccount.findUnique({ where: { id } });
  }

  markUsed(id: string) {
    return this.prisma.masterAccount.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  markCoolingDown(id: string, cooldownUntil: Date) {
    return this.prisma.masterAccount.update({
      where: { id },
      data: {
        status: MasterAccountStatus.COOLING_DOWN,
        cooldownUntil,
      },
    });
  }

  markExhausted(id: string) {
    return this.prisma.masterAccount.update({
      where: { id },
      data: {
        status: MasterAccountStatus.EXHAUSTED,
        remainingLimit: 0,
      },
    });
  }

  markAuthInvalid(id: string) {
    return this.prisma.masterAccount.update({
      where: { id },
      data: {
        status: MasterAccountStatus.AUTH_INVALID,
      },
    });
  }

  /**
   * Flags the account for administrator review without permanently disabling it.
   * Round-robin skips it because `findLeasableAccounts` only returns ACTIVE accounts.
   * An admin can re-activate it after verifying credentials.
   */
  markRequiresSync(id: string) {
    return this.prisma.masterAccount.update({
      where: { id },
      data: {
        status: MasterAccountStatus.REQUIRES_SYNC,
        vaultHealth: "STALE",
      },
    });
  }

  setKeeperKeyHash(id: string, keeperKeyHash: string) {
    return this.prisma.masterAccount.update({
      where: { id },
      data: { keeperKeyHash },
    });
  }

  /**
   * Applies a fresh cookie sync pushed by the unattended Keeper extension.
   * If the account was flagged for review (REQUIRES_SYNC/AUTH_INVALID), a successful
   * fresh sync is treated as proof of a live session and the account is promoted
   * back to ACTIVE so round-robin can pick it up again without a manual admin click.
   */
  applyKeeperSync(account: MasterAccount, encryptedCookie: string, cookieNonce: string) {
    const shouldReactivate = account.status === MasterAccountStatus.REQUIRES_SYNC || account.status === MasterAccountStatus.AUTH_INVALID;

    return this.prisma.masterAccount.update({
      where: { id: account.id },
      data: {
        encryptedCookie,
        cookieNonce,
        vaultVersion: { increment: 1 },
        vaultHealth: "COMPLETE",
        lastVaultSyncAt: new Date(),
        ...(shouldReactivate ? { status: MasterAccountStatus.ACTIVE } : {}),
      },
    });
  }

  decrementRemaining(id: string, usageUnits: number) {
    return this.prisma.masterAccount.update({
      where: { id },
      data: {
        remainingLimit: {
          decrement: usageUnits,
        },
      },
    });
  }

  toLeaseMetadata(account: MasterAccount) {
    return {
      id: account.id,
      provider: account.provider,
      status: account.status,
      remainingLimit: account.remainingLimit,
    };
  }
}
