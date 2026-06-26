import type { FastifyPluginAsync } from "fastify";
import { PlanType, Role } from "@prisma/client";
import { unauthorized } from "../../utils/errors.js";
import { ClientDashboardService } from "./client-dashboard.service.js";
import { ClientConfigService } from "./client-config.service.js";

export const clientRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/config",
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              config: {
                type: "object",
                additionalProperties: true,
              },
              configHash: { type: "string" },
            },
          },
        },
      },
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new ClientConfigService();
      return service.getConfigWithHash({
        role: request.auth.role as Role,
        plan: request.auth.plan as PlanType,
      });
    },
  );

  app.get(
    "/dashboard",
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new ClientDashboardService(app.prisma);
      return service.getDashboard(request.auth);
    },
  );
};
