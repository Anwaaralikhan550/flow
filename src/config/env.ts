import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const requiredEnvVars = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_PRIVATE_KEY_BASE64",
  "JWT_PUBLIC_KEY_BASE64",
  "COOKIE_ENCRYPTION_KEY_BASE64",
  "ALLOWED_EMAIL_DOMAINS",
] as const;

function findProjectRoot() {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return process.cwd();
    }

    currentDir = parentDir;
  }
}

const projectRoot = findProjectRoot();
const envPath = path.join(projectRoot, ".env");
const envExamplePath = path.join(projectRoot, ".env.example");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ISSUER: z.string().min(1).default("safe-ai-session-backend"),
  JWT_AUDIENCE: z.string().min(1).default("safe-ai-session-clients"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  JWT_PRIVATE_KEY_BASE64: z.string().min(1),
  JWT_PUBLIC_KEY_BASE64: z.string().min(1),
  COOKIE_ENCRYPTION_KEY_BASE64: z.string().min(1),
  ALLOWED_EMAIL_DOMAINS: z.string().min(1),
  VIRTUAL_EMAIL_DOMAIN: z.string().min(1).default("vidgen.fun"),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  GLOBAL_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  SESSION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  SESSION_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  LEASE_TTL_SECONDS: z.coerce.number().int().positive().default(150),
  SESSION_PREPARE_LOCK_SECONDS: z.coerce.number().int().positive().default(3),
  PROVIDER_INFLIGHT_JOB_CAPACITY: z.coerce.number().int().positive().default(20),
  PROVIDER_INFLIGHT_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  MASTER_VAULT_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(43_200),
  DEVICE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  RATE_LIMIT_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(900),
  CLUSTER_WORKERS: z.coerce.number().int().min(0).default(0),
  CLUSTER_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const missingVars = requiredEnvVars.filter((key) => {
    const value = process.env[key];
    return value === undefined || value.trim() === "";
  });

  const invalidIssues = parsedEnv.error.issues
    .filter((issue) => !missingVars.includes(issue.path.join(".") as (typeof requiredEnvVars)[number]))
    .map((issue) => `  - ${issue.path.join(".") || "ENV"}: ${issue.message}`);

  const message = [
    "",
    "Environment configuration error",
    "===============================",
    `Project root: ${projectRoot}`,
    `.env path checked: ${envPath}`,
    `.env exists: ${existsSync(envPath) ? "yes" : "no"}`,
    `.env.example exists: ${existsSync(envExamplePath) ? "yes" : "no"}`,
    `Process cwd: ${process.cwd()}`,
    "",
    missingVars.length > 0
      ? ["Missing required variables:", ...missingVars.map((key) => `  - ${key}`)].join("\n")
      : "No required variables are missing.",
    invalidIssues.length > 0 ? ["", "Invalid variables:", ...invalidIssues].join("\n") : "",
    "",
    "Fix:",
    "  1. Copy the template to a real .env file:",
    `     PowerShell: Copy-Item -LiteralPath \"${envExamplePath}\" -Destination \"${envPath}\"`,
    "  2. Fill the missing values in .env.",
    "  3. Generate strong secrets:",
    "     - JWT_PRIVATE_KEY_BASE64 and JWT_PUBLIC_KEY_BASE64 must be a base64-encoded RSA PEM key pair.",
    "     - COOKIE_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes.",
    "  4. Start the backend from any directory; this loader will still check the project-root .env.",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  console.error(message);
  process.exit(1);
}

export const env = parsedEnv.data;

export const allowedEmailDomains = env.ALLOWED_EMAIL_DOMAINS.split(",")
  .map((domain) => domain.trim().toLowerCase())
  .concat(env.VIRTUAL_EMAIL_DOMAIN.toLowerCase())
  .filter(Boolean);
