import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Redis } from "ioredis";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(rootDir, ".env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error("");
  console.error("Redis verification failed");
  console.error("=========================");
  console.error(`REDIS_URL is missing. Checked .env at: ${envPath}`);
  console.error("Copy .env.example to .env and set REDIS_URL=redis://localhost:6379");
  process.exit(1);
}

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
});

try {
  const pong = await redis.ping();
  console.log(`Redis connection OK: ${pong}`);
} catch (error) {
  console.error("");
  console.error("Redis verification failed");
  console.error("=========================");
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  console.error("Fix:");
  console.error("  1. Start Redis locally or with Docker.");
  console.error("  2. Confirm REDIS_URL in .env points to the running Redis instance.");
  console.error("  3. Try again with npm run redis:ping.");
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
