import { LeaseStatus, PrismaClient, Role, type Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";

const gracePeriodMs = 24 * 60 * 60 * 1000;
const batchSize = 100;

type CleanupDatabase = Pick<PrismaClient, "user">;

type CleanupResult = {
  mode: "dry-run" | "execute";
  cutoff: string;
  candidateCount: number;
  deletedCount: number;
  skippedCount: number;
  durationMs: number;
};

type CleanupOptions = {
  execute?: boolean;
  now?: Date;
  log?: (entry: Record<string, unknown>) => void;
};

function expiredCustomerWhere(cutoff: Date): Prisma.UserWhereInput {
  return {
    role: Role.CUSTOMER,
    validUntil: { lt: cutoff },
  };
}

function eligibleCustomerWhere(cutoff: Date, now: Date): Prisma.UserWhereInput {
  return {
    ...expiredCustomerWhere(cutoff),
    leases: {
      none: {
        status: LeaseStatus.ACTIVE,
        expiresAt: { gt: now },
      },
    },
  };
}

export async function cleanupExpiredCustomers(
  prisma: CleanupDatabase,
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - gracePeriodMs);
  const mode = options.execute ? "execute" : "dry-run";
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));

  const expiredCount = await prisma.user.count({
    where: expiredCustomerWhere(cutoff),
  });
  const candidateCount = await prisma.user.count({
    where: eligibleCustomerWhere(cutoff, now),
  });

  log({
    event: "customer_cleanup_started",
    mode,
    cutoff: cutoff.toISOString(),
    candidateCount,
    skippedCount: expiredCount - candidateCount,
  });

  let deletedCount = 0;

  if (options.execute) {
    while (true) {
      const candidates = await prisma.user.findMany({
        where: eligibleCustomerWhere(cutoff, now),
        orderBy: { id: "asc" },
        take: batchSize,
        select: { id: true },
      });

      if (candidates.length === 0) {
        break;
      }

      const deleted = await prisma.user.deleteMany({
        where: {
          id: { in: candidates.map((candidate) => candidate.id) },
          ...eligibleCustomerWhere(cutoff, now),
        },
      });

      deletedCount += deleted.count;
    }
  }

  const result: CleanupResult = {
    mode,
    cutoff: cutoff.toISOString(),
    candidateCount,
    deletedCount,
    skippedCount: expiredCount - deletedCount - (options.execute ? 0 : candidateCount),
    durationMs: Date.now() - startedAt,
  };

  log({
    event: "customer_cleanup_completed",
    ...result,
  });

  return result;
}

async function main() {
  const prisma = new PrismaClient();
  const execute = process.argv.includes("--execute");

  try {
    await cleanupExpiredCustomers(prisma, { execute });
  } catch (error) {
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError", message: "Customer cleanup failed" };

    console.error(
      JSON.stringify({
        event: "customer_cleanup_failed",
        mode: execute ? "execute" : "dry-run",
        error: safeError,
      }),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  void main();
}
