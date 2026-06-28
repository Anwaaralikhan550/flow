import { describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { RoundRobinService } from "../src/modules/master-accounts/round-robin.service.js";

describe("RoundRobinService", () => {
  it("holds only a short prepare lock while cookies are being applied", async () => {
    const account = {
      id: "master-1",
      status: "ACTIVE",
      remainingLimit: 10,
      encryptedCookie: "ciphertext",
      cookieNonce: "nonce",
      vaultHealth: "COMPLETE",
      lastVaultSyncAt: new Date(),
    };
    const prisma = {
      masterAccount: {
        findUnique: vi.fn().mockResolvedValue(account),
      },
    };
    const redis = {
      lrange: vi.fn().mockResolvedValue(["master-1"]),
      incr: vi.fn().mockResolvedValue(1),
      exists: vi.fn().mockResolvedValue(0),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zcard: vi.fn().mockResolvedValue(0),
      set: vi.fn().mockResolvedValue("OK"),
      zadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      lrem: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new RoundRobinService(prisma as never, redis as never);
    await service.nextAccount();

    expect(redis.set).toHaveBeenCalledWith(
      "master:master-1:lock",
      "1",
      "EX",
      env.SESSION_PREPARE_LOCK_SECONDS,
      "NX",
    );
    expect(redis.zadd).toHaveBeenCalledWith(
      "master:master-1:inflight_jobs",
      expect.any(Number),
      expect.stringMatching(/^lease-pending:/),
    );
  });

  it("skips a master account when its inflight_jobs capacity is full", async () => {
    const fullAccount = {
      id: "master-full",
      status: "ACTIVE",
      remainingLimit: env.PROVIDER_INFLIGHT_JOB_CAPACITY,
      encryptedCookie: "ciphertext",
      cookieNonce: "nonce",
      vaultHealth: "COMPLETE",
      lastVaultSyncAt: new Date(),
    };
    const openAccount = {
      ...fullAccount,
      id: "master-open",
    };
    const prisma = {
      masterAccount: {
        findUnique: vi.fn((input: { where: { id: string } }) =>
          Promise.resolve(input.where.id === "master-open" ? openAccount : fullAccount),
        ),
      },
    };
    const redis = {
      lrange: vi.fn().mockResolvedValue(["master-full", "master-open"]),
      incr: vi.fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1),
      exists: vi.fn().mockResolvedValue(0),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zcard: vi.fn()
        .mockResolvedValueOnce(env.PROVIDER_INFLIGHT_JOB_CAPACITY)
        .mockResolvedValueOnce(env.PROVIDER_INFLIGHT_JOB_CAPACITY - 1),
      set: vi.fn().mockResolvedValue("OK"),
      zadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      lrem: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new RoundRobinService(prisma as never, redis as never);
    const account = await service.nextAccount();

    expect(account?.id).toBe("master-open");
    expect(redis.set).toHaveBeenCalledWith(
      "master:master-open:lock",
      "1",
      "EX",
      env.SESSION_PREPARE_LOCK_SECONDS,
      "NX",
    );
    expect(redis.del).toHaveBeenCalledWith("master:master-full:lock");
    expect(redis.zadd).toHaveBeenCalledTimes(1);
  });

  it("skips a cached active-list master when its vault sync is stale", async () => {
    const staleAccount = {
      id: "master-stale",
      status: "ACTIVE",
      remainingLimit: 10,
      encryptedCookie: "ciphertext",
      cookieNonce: "nonce",
      vaultHealth: "COMPLETE",
      lastVaultSyncAt: new Date(Date.now() - (env.MASTER_VAULT_MAX_AGE_SECONDS + 60) * 1000),
    };
    const freshAccount = {
      ...staleAccount,
      id: "master-fresh",
      lastVaultSyncAt: new Date(),
    };
    const prisma = {
      masterAccount: {
        findUnique: vi.fn((input: { where: { id: string } }) =>
          Promise.resolve(input.where.id === "master-fresh" ? freshAccount : staleAccount),
        ),
      },
    };
    const redis = {
      lrange: vi.fn().mockResolvedValue(["master-stale", "master-fresh"]),
      incr: vi.fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1),
      exists: vi.fn().mockResolvedValue(0),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zcard: vi.fn().mockResolvedValue(0),
      set: vi.fn().mockResolvedValue("OK"),
      zadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      lrem: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new RoundRobinService(prisma as never, redis as never);
    const account = await service.nextAccount();

    expect(account?.id).toBe("master-fresh");
    expect(redis.lrem).toHaveBeenCalledWith("master:active:list", 0, "master-stale");
  });
});
