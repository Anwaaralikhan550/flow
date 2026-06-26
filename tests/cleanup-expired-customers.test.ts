import { describe, expect, it, vi } from "vitest";
import { cleanupExpiredCustomers } from "../scripts/cleanup-expired-customers.js";

const now = new Date("2026-06-06T12:00:00.000Z");

function createDatabaseMock(overrides: {
  expiredCount?: number;
  candidateCount?: number;
  batches?: Array<Array<{ id: string }>>;
  deletedCounts?: number[];
} = {}) {
  const batches = [...(overrides.batches ?? [[]])];
  const deletedCounts = [...(overrides.deletedCounts ?? [])];
  const count = vi
    .fn()
    .mockResolvedValueOnce(overrides.expiredCount ?? 0)
    .mockResolvedValueOnce(overrides.candidateCount ?? 0);
  const findMany = vi.fn().mockImplementation(async () => batches.shift() ?? []);
  const deleteMany = vi.fn().mockImplementation(async () => ({ count: deletedCounts.shift() ?? 0 }));

  return {
    prisma: {
      user: {
        count,
        findMany,
        deleteMany,
      },
    } as never,
    count,
    findMany,
    deleteMany,
  };
}

describe("cleanupExpiredCustomers", () => {
  it("defaults to dry-run without deleting customers", async () => {
    const database = createDatabaseMock({ expiredCount: 4, candidateCount: 3 });

    const result = await cleanupExpiredCustomers(database.prisma, {
      now,
      log: vi.fn(),
    });

    expect(result).toMatchObject({
      mode: "dry-run",
      candidateCount: 3,
      deletedCount: 0,
      skippedCount: 1,
    });
    expect(database.findMany).not.toHaveBeenCalled();
    expect(database.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes eligible customers in batches and repeats all safety filters", async () => {
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({ id: `customer-${index}` }));
    const database = createDatabaseMock({
      expiredCount: 103,
      candidateCount: 102,
      batches: [firstBatch, [{ id: "customer-100" }, { id: "customer-101" }], []],
      deletedCounts: [100, 2],
    });

    const result = await cleanupExpiredCustomers(database.prisma, {
      execute: true,
      now,
      log: vi.fn(),
    });

    expect(result).toMatchObject({
      mode: "execute",
      candidateCount: 102,
      deletedCount: 102,
      skippedCount: 1,
    });
    expect(database.deleteMany).toHaveBeenCalledTimes(2);

    const deleteWhere = database.deleteMany.mock.calls[0]?.[0]?.where;
    expect(deleteWhere).toMatchObject({
      role: "CUSTOMER",
      validUntil: { lt: new Date("2026-06-05T12:00:00.000Z") },
      leases: {
        none: {
          status: "ACTIVE",
          expiresAt: { gt: now },
        },
      },
    });
  });

  it("reports customers skipped by the final guarded deletion", async () => {
    const database = createDatabaseMock({
      expiredCount: 2,
      candidateCount: 2,
      batches: [[{ id: "customer-renewed" }, { id: "customer-deleted" }], []],
      deletedCounts: [1],
    });

    const result = await cleanupExpiredCustomers(database.prisma, {
      execute: true,
      now,
      log: vi.fn(),
    });

    expect(result.deletedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it("logs only aggregate cleanup metadata", async () => {
    const database = createDatabaseMock({ expiredCount: 1, candidateCount: 1 });
    const log = vi.fn();

    await cleanupExpiredCustomers(database.prisma, { now, log });

    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("email");
    expect(JSON.stringify(log.mock.calls)).not.toContain("vaultData");
    expect(JSON.stringify(log.mock.calls)).not.toContain("cookie");
  });
});
