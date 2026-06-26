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
  });

  it("skips a master account when its inflight_jobs capacity is full", async () => {
    const fullAccount = {
      id: "master-full",
      status: "ACTIVE",
      remainingLimit: 10,
      encryptedCookie: "ciphertext",
      cookieNonce: "nonce",
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
    expect(redis.set).not.toHaveBeenCalledWith(
      "master:master-full:lock",
      "1",
      "EX",
      env.SESSION_PREPARE_LOCK_SECONDS,
      "NX",
    );
  });
});
