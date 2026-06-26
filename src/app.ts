import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";
import { errorHandler } from "./utils/errors.js";
import { authPlugin } from "./plugins/auth.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { redisPlugin } from "./plugins/redis.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clientRoutes } from "./modules/client/client.routes.js";
import { sessionRoutes } from "./modules/sessions/session.routes.js";
import { masterAccountKeeperRoutes } from "./modules/master-accounts/master-account-keeper.routes.js";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildProductionCorsOrigin() {
  const explicitOrigins = (process.env.ADMIN_FRONTEND_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (explicitOrigins.includes("*")) {
    return true;
  }

  const virtualDomain = process.env.VIRTUAL_EMAIL_DOMAIN?.trim().toLowerCase();
  const domainOrigins = virtualDomain
    ? [new RegExp(`^https:\\/\\/([a-z0-9-]+\\.)*${escapeRegExp(virtualDomain)}$`, "i")]
    : [];

  return [...explicitOrigins, ...domainOrigins];
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
    trustProxy: true,
  });

  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(cors, {
    origin:
      process.env.NODE_ENV === "production"
        ? buildProductionCorsOrigin()
        : [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(redisPlugin);
  await app.register(prismaPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  app.get("/health", async () => ({
    ok: true,
    uptime: process.uptime(),
  }));

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(clientRoutes, { prefix: "/client" });
  await app.register(sessionRoutes, { prefix: "/session" });
  await app.register(masterAccountKeeperRoutes, { prefix: "/master-accounts" });

  return app;
}
