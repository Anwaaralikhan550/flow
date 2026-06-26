import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";
import { env } from "../config/env.js";

export const rateLimitPlugin = fp(async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: env.GLOBAL_RATE_LIMIT_MAX,
    timeWindow: env.GLOBAL_RATE_LIMIT_WINDOW,
    redis: app.redis,
    keyGenerator: (request) => request.ip,
  });
});
