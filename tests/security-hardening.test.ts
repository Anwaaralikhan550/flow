import { describe, expect, it, vi } from "vitest";
import nodeCrypto from "node:crypto";
import { AdminService } from "../src/modules/admin/admin.service.js";
import { MasterAccountService } from "../src/modules/master-accounts/master-account.service.js";
import { MasterAccountRepository } from "../src/modules/master-accounts/master-account.repository.js";
import { RoundRobinService } from "../src/modules/master-accounts/round-robin.service.js";
import * as crypto from "../src/config/crypto.js";
import { env } from "../src/config/env.js";

const completeVaultData = JSON.stringify([
  { name: "__Secure-next-auth.session-token", value: "session-value", domain: "labs.google", path: "/" },
  { name: "__Host-next-auth.csrf-token", value: "csrf-value", domain: "labs.google", path: "/", hostOnly: true },
  { name: "__Secure-next-auth.callback-url", value: "callback-value", domain: "labs.google", path: "/" },
]);

describe("Security Hardening", () => {
  describe("Vault Encryption", () => {
    it("never writes plaintext vaultData during creation", async () => {
      const now = new Date();
      const prisma = {
        masterAccount: {
          create: vi.fn().mockResolvedValue({
            id: "1",
            provider: "p",
            email: "e@e.com",
            status: "ACTIVE",
            dailyLimit: 100,
            remainingLimit: 100,
            createdAt: now,
            updatedAt: now,
          }),
        },
      };
      const service = new AdminService(prisma as any);
      const actor = { role: "SUPER_ADMIN" };
      const input = {
        provider: "p",
        email: "e@e.com",
        encryptedCookie: "",
        cookieNonce: "",
        vaultData: completeVaultData,
        dailyLimit: 100,
      };

      await service.addMasterAccount(actor as any, input);

      const createCall = prisma.masterAccount.create.mock.calls[0][0];
      expect(createCall.data.vaultData).toBeNull();
      expect(createCall.data.encryptedCookie).not.toBe("");
      expect(createCall.data.cookieNonce).not.toBe("");
    });

    it("performs successful encryption/decryption round-trip", async () => {
      const plainVault = completeVaultData;
      const encrypted = crypto.encryptCookie(plainVault);
      const decrypted = crypto.decryptCookie(encrypted);
      expect(decrypted).toBe(plainVault);
    });

    it("rejects incomplete vault payloads before saving credentials", async () => {
      const prisma = {
        masterAccount: {
          create: vi.fn(),
        },
      };
      const service = new AdminService(prisma as any);

      await expect(
        service.addMasterAccount(
          { role: "SUPER_ADMIN" } as any,
          {
            provider: "p",
            email: "e@e.com",
            vaultData: JSON.stringify([
              { name: "__Host-next-auth.csrf-token", value: "csrf-value", domain: "labs.google", path: "/", hostOnly: true },
            ]),
            dailyLimit: 100,
          },
        ),
      ).rejects.toThrow("missing required NextAuth cookies");

      expect(prisma.masterAccount.create).not.toHaveBeenCalled();
    });

    it("saves master proxy settings without exposing the password in the safe response", async () => {
      const now = new Date();
      const prisma = {
        masterAccount: {
          create: vi.fn().mockImplementation(({ data }) => ({
            id: "m-proxy",
            provider: data.provider,
            email: data.email,
            status: data.status,
            dailyLimit: data.dailyLimit,
            remainingLimit: data.remainingLimit,
            encryptedCookie: data.encryptedCookie,
            cookieNonce: data.cookieNonce,
            vaultVersion: data.vaultVersion,
            vaultHealth: data.vaultHealth,
            lastVaultSyncAt: data.lastVaultSyncAt,
            proxyHost: data.proxyHost,
            proxyPort: data.proxyPort,
            proxyUsername: data.proxyUsername,
            proxyPassword: data.proxyPassword,
            cooldownUntil: null,
            lastUsedAt: null,
            createdAt: now,
            updatedAt: now,
          })),
        },
      };
      const service = new AdminService(prisma as any);

      const result = await service.addMasterAccount(
        { role: "SUPER_ADMIN" } as any,
        {
          provider: "google-flow",
          email: "proxy@example.com",
          dailyLimit: 100,
          proxyHost: " proxy.local ",
          proxyPort: 9000,
          proxyUsername: "runner",
          proxyPassword: "secret",
        },
      );

      const createCall = prisma.masterAccount.create.mock.calls[0][0];
      expect(createCall.data.proxyHost).toBe("proxy.local");
      expect(createCall.data.proxyPort).toBe(9000);
      expect(createCall.data.proxyUsername).toBe("runner");
      expect(createCall.data.proxyPassword).toBe("secret");
      expect(result.account.proxyHost).toBe("proxy.local");
      expect(result.account.hasProxyPassword).toBe(true);
      expect(result.account).not.toHaveProperty("proxyPassword");
    });

    it("preserves existing proxy password when updating proxy metadata with a blank password", async () => {
      const now = new Date();
      const prisma = {
        masterAccount: {
          findUnique: vi.fn().mockResolvedValue({ id: "m1", proxyPassword: "saved-secret", deletedAt: null }),
          update: vi.fn().mockImplementation(({ data }) => ({
            id: "m1",
            provider: "google-flow",
            email: "proxy@example.com",
            status: "ACTIVE",
            dailyLimit: 100,
            remainingLimit: 100,
            encryptedCookie: "",
            cookieNonce: "",
            vaultVersion: 0,
            vaultHealth: "EMPTY",
            lastVaultSyncAt: null,
            cooldownUntil: null,
            lastUsedAt: null,
            createdAt: now,
            updatedAt: now,
            ...data,
          })),
        },
      };
      const service = new AdminService(prisma as any);

      const result = await service.updateMasterAccountProxy(
        { role: "SUPER_ADMIN" } as any,
        "m1",
        {
          proxyHost: "proxy.local",
          proxyPort: 8001,
          proxyUsername: "runner",
          proxyPassword: "",
        },
      );

      const updateCall = prisma.masterAccount.update.mock.calls[0][0];
      expect(updateCall.data.proxyPassword).toBe("saved-secret");
      expect(result.account.hasProxyPassword).toBe(true);
    });

    it("fails closed on corrupted ciphertext", async () => {
      const account = {
        id: "m1",
        encryptedCookie: "corrupted-base64",
        cookieNonce: "nonce-base64",
      };
      const prisma = {
        masterAccountLease: { create: vi.fn() },
        masterAccount: { update: vi.fn() }
      };
      const redis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
      };
      const roundRobin = {
        nextAccount: vi.fn().mockResolvedValue(account),
        clearCapacityReservation: vi.fn().mockResolvedValue(undefined),
      };

      const service = new MasterAccountService(prisma as any, redis as any);
      (service as any).roundRobin = roundRobin;

      await expect(service.leaseAccount({ userId: "u1", fingerprintId: "f1" }))
        .rejects.toThrow("Failed to securely retrieve master account credentials");
      
      expect(redis.del).toHaveBeenCalledWith("master:m1:lock");
    });

    it("releases the master lock if DB lease creation fails after selection", async () => {
      const encrypted = crypto.encryptCookie(JSON.stringify([{ name: "n", value: "v" }]));
      const account = {
        id: "m1",
        provider: "google-flow",
        remainingLimit: 100,
        encryptedCookie: encrypted.ciphertext,
        cookieNonce: encrypted.nonce,
      };
      const prisma = {
        masterAccountLease: {
          create: vi.fn().mockRejectedValue(new Error("db-create-failed")),
          update: vi.fn(),
        },
        masterAccount: { update: vi.fn() }
      };
      const redis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn().mockResolvedValue(1),
      };
      const roundRobin = {
        nextAccount: vi.fn().mockResolvedValue(account),
        clearCapacityReservation: vi.fn().mockResolvedValue(undefined),
        clearInflightJob: vi.fn().mockResolvedValue(undefined),
      };

      const service = new MasterAccountService(prisma as any, redis as any);
      (service as any).roundRobin = roundRobin;

      await expect(service.leaseAccount({ userId: "u1", fingerprintId: "f1" }))
        .rejects.toThrow("db-create-failed");

      expect(redis.del).toHaveBeenCalledWith("master:m1:lock");
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("returns a retryable preparing response when no provider slot is available", async () => {
      const prisma = {
        masterAccountLease: {
          create: vi.fn(),
        },
        masterAccount: { update: vi.fn() },
      };
      const redis = {
        set: vi.fn().mockResolvedValue("OK"),
      };
      const roundRobin = {
        nextAccount: vi.fn().mockResolvedValue(null),
      };

      const service = new MasterAccountService(prisma as any, redis as any);
      (service as any).roundRobin = roundRobin;

      const response = await service.leaseAccount({ userId: "u1", fingerprintId: "f1" });

      expect(response).toEqual({
        available: false,
        retryAfterMs: 1500,
        message: "Preparing session...",
      });
      expect(redis.set).toHaveBeenCalledWith("session:wait:u1:f1", "1", "EX", 2);
      expect(prisma.masterAccountLease.create).not.toHaveBeenCalled();
    });

    it("transfers a reserved capacity slot to the created lease", async () => {
      const encrypted = crypto.encryptCookie(completeVaultData);
      const expiresAt = new Date(Date.now() + 60_000);
      const account = {
        id: "m1",
        provider: "google-flow",
        remainingLimit: 20,
        vaultVersion: 3,
        encryptedCookie: encrypted.ciphertext,
        cookieNonce: encrypted.nonce,
        proxyHost: null,
        capacityReservationId: "lease-pending:reservation-1",
        activeJobCount: 7,
        capacityLimit: 20,
      };
      const prisma = {
        masterAccountLease: {
          create: vi.fn().mockResolvedValue({ id: "lease-1" }),
        },
        masterAccount: {
          update: vi.fn().mockResolvedValue({ id: "m1" }),
        },
      };
      const redis = {
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
      };
      const roundRobin = {
        nextAccount: vi.fn().mockResolvedValue(account),
        transferCapacityReservation: vi.fn().mockResolvedValue(undefined),
        clearCapacityReservation: vi.fn().mockResolvedValue(undefined),
        clearInflightJob: vi.fn().mockResolvedValue(undefined),
      };

      const service = new MasterAccountService(prisma as any, redis as any);
      (service as any).roundRobin = roundRobin;

      const response = await service.leaseAccount({ userId: "u1", fingerprintId: "f1" });

      expect(response).toMatchObject({
        available: true,
        leaseId: "lease-1",
        activeJobCount: 7,
        capacityLimit: 20,
      });
      expect(roundRobin.transferCapacityReservation).toHaveBeenCalledWith("m1", "lease-pending:reservation-1", "lease-1");
      expect(roundRobin.clearCapacityReservation).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith("master:m1:lock");
    });

    it("marks submitted releases as inflight and buffers master reuse for one second", async () => {
      const leasePayload = JSON.stringify({
        userId: "u1",
        masterAccountId: "m1",
        deviceFingerprintId: "f1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const prisma = {
        masterAccountLease: {
          findUnique: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const redis = {
        get: vi.fn((key: string) => key === "lease:l1" ? Promise.resolve(leasePayload) : Promise.resolve(null)),
        del: vi.fn().mockResolvedValue(1),
        zremrangebyscore: vi.fn().mockResolvedValue(0),
        zadd: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
      };
      const service = new MasterAccountService(prisma as any, redis as any);

      await service.releaseAccount("l1", { userId: "u1", submitted: true });

      expect(redis.zadd).toHaveBeenCalledWith("master:m1:inflight_jobs", expect.any(Number), "l1");
      expect(redis.expire).toHaveBeenCalledWith("master:m1:inflight_jobs", env.PROVIDER_INFLIGHT_TTL_SECONDS);
      expect(redis.expire).toHaveBeenCalledWith("master:m1:lock", 1);
      expect(redis.del).toHaveBeenCalledWith("lease:l1");
      expect(redis.del).not.toHaveBeenCalledWith("master:m1:lock", "lease:l1");
    });

    it("accepts accounts with encrypted fields as leasable", async () => {
      const accounts = [
        { id: "m1", encryptedCookie: "c1", cookieNonce: "n1" }
      ];
      const prisma = {
        masterAccount: {
          findMany: vi.fn().mockResolvedValue(accounts),
        },
      };
      const repo = new MasterAccountRepository(prisma as any);
      const result = await repo.findLeasableAccounts();
      
      expect(result).toHaveLength(1);
      expect(prisma.masterAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          encryptedCookie: { not: "" },
          cookieNonce: { not: "" }
        })
      }));
    });
  });

  describe("Admin Authorization Handoff", () => {
    it("requires a super admin actor and consumes an issuer-bound sync code exactly once", async () => {
      const code = "SYNC-CODE-123";
      const hashedCode = nodeCrypto.createHash("sha256").update(code).digest("hex");
      const key = `sync:code:${hashedCode}`;
      const masterAccountId = "master-1";
      const actor = { userId: "admin-1", role: "SUPER_ADMIN" };
      const syncGrant = JSON.stringify({ masterAccountId, issuedToUserId: actor.userId });

      const redis = {
        getdel: vi.fn().mockResolvedValue(syncGrant),
        del: vi.fn().mockResolvedValue(1),
      };
      const now = new Date();
      const prisma = {
        masterAccount: {
          findUnique: vi.fn().mockResolvedValue({ id: masterAccountId }),
          update: vi.fn().mockResolvedValue({
            id: masterAccountId,
            provider: "p",
            email: "e@e.com",
            status: "ACTIVE",
            dailyLimit: 100,
            remainingLimit: 100,
            createdAt: now,
            updatedAt: now,
          }),
        },
      };

      const service = new AdminService(prisma as any, redis as any);
      
      await service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData, syncCode: code });
      expect(redis.getdel).toHaveBeenCalledWith(key);

      redis.getdel.mockResolvedValue(null);
      await expect(service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData, syncCode: code }))
        .rejects.toThrow("Invalid or expired sync authorization");

      redis.getdel.mockResolvedValue(JSON.stringify({ masterAccountId: "different-account", issuedToUserId: actor.userId }));
      await expect(service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData, syncCode: code }))
        .rejects.toThrow("Invalid or expired sync authorization");

      redis.getdel.mockResolvedValue(JSON.stringify({ masterAccountId, issuedToUserId: "different-admin" }));
      await expect(service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData, syncCode: code }))
        .rejects.toThrow("Invalid or expired sync authorization");

      redis.getdel.mockResolvedValue(syncGrant);
      await expect(service.updateVaultData({ userId: "admin-2", role: "ADMIN" }, masterAccountId, { vaultData: completeVaultData, syncCode: code }))
        .rejects.toThrow("Admin permission required");

      await expect(service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData }))
        .rejects.toThrow("Authorization required for vault synchronization");

      redis.getdel.mockResolvedValue(masterAccountId);
      await expect(service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData, syncCode: code }))
        .rejects.toThrow("Invalid or expired sync authorization");
    });

    it("prevents race conditions via atomic getdel (concurrency test)", async () => {
      const code = "CONCURRENT-CODE";
      const hashedCode = nodeCrypto.createHash("sha256").update(code).digest("hex");
      const key = `sync:code:${hashedCode}`;
      const masterAccountId = "master-1";
      const actor = { userId: "admin-1", role: "SUPER_ADMIN" };
      const syncGrant = JSON.stringify({ masterAccountId, issuedToUserId: actor.userId });

      const now = new Date();
      const prisma = {
        masterAccount: {
          findUnique: vi.fn().mockResolvedValue({ id: masterAccountId }),
          update: vi.fn().mockResolvedValue({
            id: masterAccountId, provider: "p", email: "e@e.com", status: "ACTIVE",
            dailyLimit: 100, remainingLimit: 100, createdAt: now, updatedAt: now,
          }),
        },
      };

      // Mock redis.getdel to succeed ONLY the first time it's called
      const redis = {
        getdel: vi.fn()
          .mockResolvedValueOnce(syncGrant)
          .mockResolvedValue(null),
      };

      const service = new AdminService(prisma as any, redis as any);

      // Fire two requests simultaneously
      const [res1, res2] = await Promise.allSettled([
        service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData, syncCode: code }),
        service.updateVaultData(actor, masterAccountId, { vaultData: completeVaultData, syncCode: code }),
      ]);

      // Exactly one must succeed
      const successes = [res1, res2].filter(r => r.status === "fulfilled");
      const rejections = [res1, res2].filter(r => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(rejections).toHaveLength(1);
      expect((rejections[0] as any).reason.message).toBe("Invalid or expired sync authorization");
      expect(redis.getdel).toHaveBeenCalledTimes(2);
    });
  });
});
