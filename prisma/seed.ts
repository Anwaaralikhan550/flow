import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PlanType, PrismaClient, Role } from "@prisma/client";
import dotenv from "dotenv";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

const defaultPlans: Record<
  PlanType,
  {
    creditsLimit: number;
    priceCents: number;
    currency: string;
    durationDays: number;
  }
> = {
  BASIC: {
    creditsLimit: 20,
    priceCents: 0,
    currency: "USD",
    durationDays: 30,
  },
  PRO: {
    creditsLimit: 100,
    priceCents: 1499,
    currency: "USD",
    durationDays: 30,
  },
  ULTRA: {
    creditsLimit: 500,
    priceCents: 2999,
    currency: "USD",
    durationDays: 30,
  },
};

function findProjectRoot() {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    if (existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return process.cwd();
    }

    currentDir = parentDir;
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required seed variable: ${name}`);
  }
  return value;
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function seedPlans() {
  for (const [plan, config] of Object.entries(defaultPlans) as Array<[PlanType, (typeof defaultPlans)[PlanType]]>) {
    await prisma.planConfig.upsert({
      where: { plan },
      update: {
        ...config,
        isActive: true,
      },
      create: {
        plan,
        ...config,
        isActive: true,
      },
    });
  }
}

async function seedSuperAdmin() {
  const email = requireEnv("SUPER_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("SUPER_ADMIN_PASSWORD");
  const validDays = Number.parseInt(process.env.SUPER_ADMIN_VALID_DAYS ?? "3650", 10);
  const creditsLimit = Number.parseInt(process.env.SUPER_ADMIN_CREDITS_LIMIT ?? "1000000", 10);

  if (!Number.isFinite(validDays) || validDays < 1) {
    throw new Error("SUPER_ADMIN_VALID_DAYS must be a positive integer.");
  }

  if (!Number.isFinite(creditsLimit) || creditsLimit < 1) {
    throw new Error("SUPER_ADMIN_CREDITS_LIMIT must be a positive integer.");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: Role.SUPER_ADMIN,
      plan: PlanType.ULTRA,
      validUntil: daysFromNow(validDays),
      isManuallyDisabled: false,
      creditsLimit,
    },
    create: {
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      plan: PlanType.ULTRA,
      validUntil: daysFromNow(validDays),
      isManuallyDisabled: false,
      creditsLimit,
      creditsUsed: 0,
    },
  });

  console.log(`${existing ? "Updated" : "Created"} SUPER_ADMIN: ${email}`);
}

async function main() {
  const projectRoot = findProjectRoot();
  const envPath = path.join(projectRoot, ".env");

  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }

  console.log(`Seeding database from project root: ${projectRoot}`);
  await seedPlans();
  console.log("Default plans ready: BASIC, PRO, ULTRA");
  await seedSuperAdmin();
}

main()
  .catch((error: unknown) => {
    console.error("");
    console.error("Database seed failed");
    console.error("====================");
    console.error(error instanceof Error ? error.message : error);
    console.error("");
    console.error("Fix:");
    console.error("  1. Ensure .env exists in the project root.");
    console.error("  2. Set DATABASE_URL, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD.");
    console.error("  3. Run npm run prisma:migrate before seeding on a fresh database.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
