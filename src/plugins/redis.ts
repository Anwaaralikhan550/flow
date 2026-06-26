import fp from "fastify-plugin";
import { createRedisClient } from "../config/redis.js";

export const redisPlugin = fp(async (app) => {
  const redis = createRedisClient();
  app.decorate("redis", redis);

  app.addHook("onClose", async () => {
    redis.disconnect();
  });
});
