import { PlanType } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { unauthorized } from "../../utils/errors.js";
import { AdminService } from "./admin.service.js";
import {
  addMasterAccountSchema,
  createAdminSchema,
  deleteUserSchema,
  getGeneratedUserSettingsSchema,
  generateSyncCodeSchema,
  generateUserSchema,
  listAdminsSchema,
  salesReportSchema,
  updateAdminStatusSchema,
  updateGeneratedUserSettingsSchema,
  listMasterAccountsSchema,
  updateMasterAccountVaultDataSchema,
  updateMasterAccountStatusSchema,
  deleteMasterAccountSchema,
  generateKeeperKeySchema,
  updateUserStatusSchema,
  updateUserPlanSchema,
  upsertAppConfigSchema,
  upsertPlanConfigSchema,
  type AddMasterAccountBody,
  type CreateAdminBody,
  type GenerateUserBody,
  type UpdateGeneratedUserSettingsBody,
  type UpdateAdminStatusBody,
  type UpdateMasterAccountVaultDataBody,
  type UpdateMasterAccountStatusBody,
  type UpdateUserStatusBody,
  type UpdateUserPlanBody,
  type UpsertAppConfigBody,
  type UpsertPlanConfigBody,
} from "./admin.schemas.js";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CreateAdminBody }>(
    "/create-admin",
    {
      preHandler: [app.authenticate],
      schema: createAdminSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.createAdmin(request.auth, request.body);
    },
  );

  app.post<{ Body: GenerateUserBody }>(
    "/generate-user",
    {
      preHandler: [app.authenticate],
      schema: generateUserSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.generateUser(request.auth, {
        ...request.body,
        plan: request.body.plan as PlanType,
      });
    },
  );

  app.get(
    "/generated-user-settings",
    {
      preHandler: [app.authenticate],
      schema: getGeneratedUserSettingsSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.getGeneratedUserSettings(request.auth);
    },
  );

  app.put<{ Body: UpdateGeneratedUserSettingsBody }>(
    "/generated-user-settings",
    {
      preHandler: [app.authenticate],
      schema: updateGeneratedUserSettingsSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.updateGeneratedUserSettings(request.auth, request.body);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateUserPlanBody }>(
    "/users/:id/plan",
    {
      preHandler: [app.authenticate],
      schema: updateUserPlanSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.updateUserPlan(request.auth, request.params.id, request.body.plan as PlanType);
    },
  );

  app.get(
    "/admins",
    {
      preHandler: [app.authenticate],
      schema: listAdminsSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.getAdmins(request.auth);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateAdminStatusBody }>(
    "/admins/:id/status",
    {
      preHandler: [app.authenticate],
      schema: updateAdminStatusSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.updateAdminStatus(request.auth, request.params.id, request.body.isManuallyDisabled);
    },
  );

  app.get(
    "/sales-report",
    {
      preHandler: [app.authenticate],
      schema: salesReportSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.salesReport(request.auth);
    },
  );

  app.post<{ Body: UpsertPlanConfigBody }>(
    "/plan-config",
    {
      preHandler: [app.authenticate],
      schema: upsertPlanConfigSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.upsertPlanConfig(request.auth, {
        ...request.body,
        plan: request.body.plan as PlanType,
      });
    },
  );

  app.post<{ Body: UpsertAppConfigBody }>(
    "/app-config",
    {
      preHandler: [app.authenticate],
      schema: upsertAppConfigSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.upsertAppConfig(request.auth, request.body);
    },
  );

  app.get(
    "/master-accounts",
    {
      preHandler: [app.authenticate],
      schema: listMasterAccountsSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.getMasterAccounts(request.auth);
    },
  );

  app.post<{ Body: AddMasterAccountBody }>(
    "/master-accounts",
    {
      preHandler: [app.authenticate],
      schema: addMasterAccountSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.addMasterAccount(request.auth, request.body);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/master-accounts/:id/sync-code",
    {
      preHandler: [app.authenticate],
      schema: generateSyncCodeSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.generateSyncCode(request.auth, request.params.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/master-accounts/:id/keeper-key",
    {
      preHandler: [app.authenticate],
      schema: generateKeeperKeySchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.generateKeeperKey(request.auth, request.params.id);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateMasterAccountVaultDataBody & { syncCode?: string } }>(
    "/master-accounts/:id/vault-data",
    {
      preHandler: [app.authenticate],
      schema: updateMasterAccountVaultDataSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.updateVaultData(request.auth, request.params.id, request.body);
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateMasterAccountStatusBody }>(
    "/master-accounts/:id/status",
    {
      preHandler: [app.authenticate],
      schema: updateMasterAccountStatusSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.updateMasterAccountStatus(request.auth, request.params.id, request.body.status);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/master-accounts/:id",
    {
      preHandler: [app.authenticate],
      schema: deleteMasterAccountSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.deleteMasterAccount(request.auth, request.params.id);
    },
  );

  app.get(
    "/analytics",
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.analytics(request.auth);
    },
  );

  app.get(
    "/revenue-report",
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.revenueReport(request.auth);
    },
  );

  app.get(
    "/users/active",
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.listUsers(request.auth, "active");
    },
  );

  app.get(
    "/users/expired",
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.listUsers(request.auth, "expired");
    },
  );

  app.get(
    "/users/pending-manual",
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.listUsers(request.auth, "pending-manual");
    },
  );

  app.post<{ Params: { userId: string }; Body: UpdateUserStatusBody }>(
    "/user/toggle-status/:userId",
    {
      preHandler: [app.authenticate],
      schema: updateUserStatusSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.updateUserManualStatus(request.auth, request.params.userId, request.body.isManuallyDisabled);
    },
  );

  app.delete<{ Params: { userId: string } }>(
    "/users/:userId",
    {
      preHandler: [app.authenticate],
      schema: deleteUserSchema,
    },
    async (request) => {
      if (!request.auth) {
        throw unauthorized();
      }

      const service = new AdminService(app.prisma, app.redis);
      return service.deleteCustomerUser(request.auth, request.params.userId);
    },
  );
};
