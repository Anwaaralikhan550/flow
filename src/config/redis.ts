import { Redis } from "ioredis";
import { env } from "./env.js";

export function createRedisClient() {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
