import { describe, expect, it, vi } from "vitest";
import { UsageService } from "../src/modules/usage/usage.service.js";

const service = new UsageService({} as never, {} as never);

describe("UsageService.normalizeOutcome", () => {
  it("detects provider rate limiting from HTTP 429", () => {
    expect(service.normalizeOutcome({ userId: "u1", fingerprintId: "f1", leaseId: "l1", providerStatusCode: 429 })).toBe(
      "RATE_LIMITED",
    );
  });

  it("detects provider quota exhaustion from error text", () => {
    expect(
      service.normalizeOutcome({
        userId: "u1",
        fingerprintId: "f1",
        leaseId: "l1",
        providerMessage: "Quota exceeded for this account",
      }),
    ).toBe("QUOTA_EXHAUSTED");
  });

  it("detects invalid authorization responses", () => {
    expect(service.normalizeOutcome({ userId: "u1", fingerprintId: "f1", leaseId: "l1", providerStatusCode: 401 })).toBe(
      "AUTH_INVALID",
    );
  });

  it("treats server-side provider failures as transient", () => {
    expect(service.normalizeOutcome({ userId: "u1", fingerprintId: "f1", leaseId: "l1", providerStatusCode: 503 })).toBe(
      "TRANSIENT_ERROR",
    );
  });

  it("defaults to success when no provider error is present", () => {
    expect(service.normalizeOutcome({ userId: "u1", fingerprintId: "f1", leaseId: "l1" })).toBe("SUCCESS");
  });
});

describe("UsageService.reportUsage idempotency", () => {
  const leasePayload = JSON.stringify({
    userId: "u1",
    masterAccountId: "m1",
    deviceFingerprintId: "f1",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  it("does not decrement master quota twice for duplicate success reports", async () => {
    const tx = {
      usageReport: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ outcome: "SUCCESS" }),
        create: vi.fn().mockResolvedValue({ id: "r1" }),
      },
      masterAccount: {
        update: vi.fn().mockResolvedValue({ remainingLimit: 99 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const redis = {
      get: vi.fn((key: string) => key === "lease:l1" ? Promise.resolve(leasePayload) : Promise.resolve(null)),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      zrem: vi.fn().mockResolvedValue(1),
    };
    const service = new UsageService(prisma as any, redis as any);

    const first = await service.reportUsage({ userId: "u1", fingerprintId: "f1", leaseId: "l1", outcome: "SUCCESS" });
    const second = await service.reportUsage({ userId: "u1", fingerprintId: "f1", leaseId: "l1", outcome: "SUCCESS" });

    expect(first).toEqual({ outcome: "SUCCESS", accepted: true });
    expect(second).toEqual({ outcome: "SUCCESS", accepted: true, duplicate: true });
    expect(tx.usageReport.create).toHaveBeenCalledTimes(1);
    expect(tx.masterAccount.update).toHaveBeenCalledTimes(1);
  });

  it("treats a leaseId unique conflict as a safe duplicate report", async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue({ code: "P2002" }),
      usageReport: {
        findUnique: vi.fn().mockResolvedValue({ outcome: "SUCCESS" }),
      },
    };
    const redis = {
      get: vi.fn((key: string) => key === "lease:l1" ? Promise.resolve(leasePayload) : Promise.resolve(null)),
      set: vi.fn(),
      zrem: vi.fn().mockResolvedValue(1),
    };
    const service = new UsageService(prisma as any, redis as any);

    await expect(service.reportUsage({ userId: "u1", fingerprintId: "f1", leaseId: "l1", outcome: "SUCCESS" }))
      .resolves.toEqual({ outcome: "SUCCESS", accepted: true, duplicate: true });
  });

  it("applies repeated transient failure cooldowns with a 60 second cap", async () => {
    const prisma = {
      usageReport: {
        create: vi.fn().mockResolvedValue({ id: "r1" }),
      },
      masterAccount: {
        update: vi.fn().mockResolvedValue({ id: "m1" }),
      },
    };
    const redis = {
      get: vi.fn((key: string) => key === "lease:l1" ? Promise.resolve(leasePayload) : Promise.resolve(null)),
      incr: vi.fn().mockResolvedValue(7),
      expire: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue("OK"),
      lrem: vi.fn().mockResolvedValue(1),
      zrem: vi.fn().mockResolvedValue(1),
    };
    const service = new UsageService(prisma as any, redis as any);

    await expect(service.reportUsage({ userId: "u1", fingerprintId: "f1", leaseId: "l1", outcome: "TRANSIENT_ERROR" }))
      .resolves.toEqual({ outcome: "TRANSIENT_ERROR", accepted: true });

    expect(redis.set).toHaveBeenCalledWith("master:m1:cooldown", expect.any(String), "EX", 60);
    expect(redis.zrem).toHaveBeenCalledWith("master:m1:inflight_jobs", "l1");
  });
});
