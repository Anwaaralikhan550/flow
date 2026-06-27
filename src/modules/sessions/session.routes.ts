import type { FastifyPluginAsync } from "fastify";
import { env } from "../../config/env.js";
import { unauthorized } from "../../utils/errors.js";
import { BillingService } from "../billing/billing.service.js";
import { leaseAccountSchema, reportUsageSchema, releaseUsageSchema, type ReportUsageBody, type ReleaseUsageBody } from "./session.schemas.js";
import { SessionService } from "./session.service.js";

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/lease-account",
    {
      preHandler: [app.authenticate],
      schema: leaseAccountSchema,
      config: {
        rateLimit: {
          max: env.SESSION_RATE_LIMIT_MAX,
          timeWindow: env.SESSION_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const billing = new BillingService(app.prisma);
      await billing.assertCanStartPremiumUsage(request.auth);

      const service = new SessionService(app.prisma, app.redis);
      return service.leaseAccount(request.auth);
    },
  );

  app.post<{ Body: ReleaseUsageBody }>(
    "/release-usage",
    {
      preHandler: [app.authenticate],
      schema: releaseUsageSchema,
      config: {
        rateLimit: {
          max: env.SESSION_RATE_LIMIT_MAX,
          timeWindow: env.SESSION_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new SessionService(app.prisma, app.redis);
      return service.releaseUsage(request.auth, request.body);
    },
  );

  app.post<{ Body: ReportUsageBody }>(
    "/report-usage",
    {
      preHandler: [app.authenticate],
      schema: reportUsageSchema,
      config: {
        rateLimit: {
          max: env.SESSION_RATE_LIMIT_MAX,
          timeWindow: env.SESSION_RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new SessionService(app.prisma, app.redis);
      const result = await service.reportUsage(request.auth, request.body);
      if (result.outcome === "SUCCESS" && !result.duplicate) {
        const billing = new BillingService(app.prisma);
        await billing.recordSuccessfulPremiumUsage(request.auth, result.usageUnits);
      }

      return result;
    },
  );
};
