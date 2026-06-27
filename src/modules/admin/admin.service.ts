import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { MasterAccountStatus, PlanType, Role, type MasterAccount, type PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { encryptCookie } from "../../config/crypto.js";
import { badRequest, forbidden, notFound } from "../../utils/errors.js";
import { hashPassword } from "../../utils/password.js";
import { toUserDashboardSummary } from "../subscriptions/subscription.service.js";
import { RoundRobinService } from "../master-accounts/round-robin.service.js";
import { validateCompleteVaultData } from "../master-accounts/vault-validation.js";

const defaultPlanCredits: Record<PlanType, number> = {
  BASIC: 20,
  PRO: 100,
  ULTRA: 500,
};

const karachiUtcOffsetHours = 5;
const dayMs = 24 * 60 * 60 * 1000;
const generatedUserDefaultsConfigKey = "generated_user_defaults";
const defaultGeneratedUserValidDays = 30;

type ProxyConfigInput = {
  proxyHost?: string | null;
  proxyPort?: number | null;
  proxyUsername?: string | null;
  proxyPassword?: string | null;
};

type ExistingProxyConfig = Pick<MasterAccount, "proxyPassword">;

export class AdminService {
  private readonly roundRobin?: RoundRobinService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis,
  ) {
    this.roundRobin = redis ? new RoundRobinService(prisma, redis) : undefined;
  }

  async createAdmin(actor: { userId: string; role: string }, input: {
    email: string;
    password: string;
    validDays?: number;
    creditsLimit?: number;
  }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const validUntil = this.daysFromNow(input.validDays ?? 365);
    const admin = await this.prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash: await hashPassword(input.password),
        role: Role.ADMIN,
        plan: PlanType.ULTRA,
        validUntil,
        creditsLimit: input.creditsLimit ?? 100_000,
        creditsUsed: 0,
        createdByAdminId: actor.userId,
      },
      select: this.safeUserSelect(),
    });

    return { admin: toUserDashboardSummary(admin) };
  }

  async generateUser(actor: { userId: string; role: string }, input: {
    plan: PlanType;
    password?: string;
    validDays?: number;
    creditsLimit?: number;
  }) {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);

    const planConfig = await this.prisma.planConfig.findUnique({
      where: { plan: input.plan },
    });
    const validDays = input.validDays ?? (await this.getDefaultGeneratedUserValidDays(planConfig?.durationDays ?? defaultGeneratedUserValidDays));
    const password = input.password ?? nanoid(18);
    const email = await this.generateUniqueVirtualEmail();

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: Role.CUSTOMER,
        plan: input.plan,
        validUntil: this.daysFromNow(validDays),
        creditsLimit: input.creditsLimit ?? planConfig?.creditsLimit ?? defaultPlanCredits[input.plan],
        creditsUsed: 0,
        createdByAdminId: actor.userId,
      },
      select: this.safeUserSelect(),
    });

    return {
      user: toUserDashboardSummary(user),
      password,
    };
  }

  async getGeneratedUserSettings(actor: { role: string }) {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);

    return {
      validDays: await this.getDefaultGeneratedUserValidDays(),
    };
  }

  async updateGeneratedUserSettings(actor: { userId: string; role: string }, input: { validDays: number }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const validDays = this.normalizeValidDays(input.validDays);
    await this.prisma.appConfig.upsert({
      where: { key: generatedUserDefaultsConfigKey },
      update: {
        value: { validDays },
        updatedBy: actor.userId,
      },
      create: {
        key: generatedUserDefaultsConfigKey,
        value: { validDays },
        updatedBy: actor.userId,
      },
    });

    return { validDays };
  }

  async updateUserPlan(actor: { userId: string; role: string }, id: string, plan: PlanType) {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);

    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        ...this.customerScope(actor),
      },
      select: { id: true },
    });

    if (!existing) {
      throw forbidden("User is outside this admin scope", "USER_SCOPE_FORBIDDEN");
    }

    const creditsLimit = await this.resolvePlanCredits(plan);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        plan,
        creditsLimit,
      },
      select: this.safeUserSelect(),
    });

    return {
      user: toUserDashboardSummary(user),
    };
  }

  async upsertPlanConfig(actor: { userId: string; role: string }, input: {
    plan: PlanType;
    creditsLimit: number;
    priceCents?: number;
    currency?: string;
    durationDays?: number;
    isActive?: boolean;
  }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    return this.prisma.planConfig.upsert({
      where: { plan: input.plan },
      update: {
        creditsLimit: input.creditsLimit,
        priceCents: input.priceCents,
        currency: input.currency,
        durationDays: input.durationDays,
        isActive: input.isActive,
      },
      create: {
        plan: input.plan,
        creditsLimit: input.creditsLimit,
        priceCents: input.priceCents ?? 0,
        currency: input.currency ?? "USD",
        durationDays: input.durationDays ?? 30,
        isActive: input.isActive ?? true,
      },
    });
  }

  async getAdmins(actor: { role: string }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: this.safeUserSelect(),
      orderBy: [{ isManuallyDisabled: "asc" }, { createdAt: "desc" }],
    });

    return {
      admins: admins.map((admin) => toUserDashboardSummary(admin)),
    };
  }

  async updateAdminStatus(actor: { role: string }, id: string, isManuallyDisabled: boolean) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        role: Role.ADMIN,
      },
      select: { id: true },
    });

    if (!existing) {
      throw notFound("Admin account was not found", "ADMIN_NOT_FOUND");
    }

    const admin = await this.prisma.user.update({
      where: { id },
      data: { isManuallyDisabled },
      select: this.safeUserSelect(),
    });

    return {
      admin: toUserDashboardSummary(admin),
    };
  }

  async salesReport(actor: { role: string }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const [startOfDay, endOfDay] = this.karachiDayWindow();
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: {
        id: true,
        email: true,
      },
      orderBy: { email: "asc" },
    });
    const adminIds = admins.map((admin) => admin.id);

    const sales =
      adminIds.length > 0
        ? await this.prisma.user.groupBy({
            by: ["createdByAdminId", "plan"],
            where: {
              role: Role.CUSTOMER,
              createdByAdminId: { in: adminIds },
              createdAt: {
                gte: startOfDay,
                lt: endOfDay,
              },
            },
            _count: { _all: true },
          })
        : [];

    const counts = new Map<string, Record<PlanType, number>>();
    for (const row of sales) {
      if (!row.createdByAdminId) {
        continue;
      }
      const current = counts.get(row.createdByAdminId) ?? {
        BASIC: 0,
        PRO: 0,
        ULTRA: 0,
      };
      current[row.plan] = row._count._all;
      counts.set(row.createdByAdminId, current);
    }

    return admins.map((admin) => {
      const current = counts.get(admin.id) ?? {
        BASIC: 0,
        PRO: 0,
        ULTRA: 0,
      };
      return {
        adminId: admin.id,
        adminName: admin.email,
        basicCount: current.BASIC,
        proCount: current.PRO,
        ultraCount: current.ULTRA,
      };
    });
  }

  async upsertAppConfig(actor: { userId: string; role: string }, input: { key: string; value: unknown }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    return this.prisma.appConfig.upsert({
      where: { key: input.key },
      update: {
        value: input.value as object,
        updatedBy: actor.userId,
      },
      create: {
        key: input.key,
        value: input.value as object,
        updatedBy: actor.userId,
      },
    });
  }

  async getMasterAccounts(actor: { role: string }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const accounts = await this.prisma.masterAccount.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: "asc" }, { lastUsedAt: "desc" }, { createdAt: "desc" }],
    });
    const capacityByAccountId = new Map<string, { activeJobCount: number; capacityLimit: number }>();
    if (this.roundRobin) {
      await Promise.all(
        accounts.map(async (account) => {
          const snapshot = await this.roundRobin?.getCapacitySnapshot(account).catch(() => null);
          if (snapshot) {
            capacityByAccountId.set(account.id, snapshot);
          }
        }),
      );
    }

    return {
      accounts: accounts.map((account) => this.safeMasterAccount(account, capacityByAccountId.get(account.id))),
    };
  }

  async addMasterAccount(
    actor: { role: string },
    input: {
      provider: string;
      email: string;
      vaultData?: string | null;
      dailyLimit: number;
      remainingLimit?: number;
      status?: "ACTIVE" | "COOLING_DOWN" | "EXHAUSTED" | "AUTH_INVALID" | "REQUIRES_SYNC" | "DISABLED";
    } & ProxyConfigInput,
  ) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);
    const vaultSummary = validateCompleteVaultData(input.vaultData);
    const proxyConfig = this.normalizeProxyConfig(input);

    let encryptedCookie = "";
    let cookieNonce = "";
    const now = new Date();

    if (input.vaultData) {
      const encrypted = encryptCookie(input.vaultData);
      encryptedCookie = encrypted.ciphertext;
      cookieNonce = encrypted.nonce;
    }

    const account = await this.prisma.masterAccount.create({
      data: {
        provider: input.provider.trim(),
        email: input.email.trim().toLowerCase(),
        encryptedCookie,
        cookieNonce,
        vaultData: null,
        vaultVersion: vaultSummary ? 1 : 0,
        vaultHealth: vaultSummary ? "COMPLETE" : "EMPTY",
        lastVaultSyncAt: vaultSummary ? now : null,
        status: input.status ? (input.status as MasterAccountStatus) : MasterAccountStatus.ACTIVE,
        dailyLimit: input.dailyLimit,
        remainingLimit: input.remainingLimit ?? input.dailyLimit,
        ...proxyConfig,
      },
    });

    return {
      account: this.safeMasterAccount(account),
    };
  }

  async updateMasterAccountProxy(actor: { role: string }, id: string, input: ProxyConfigInput) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const existing = await this.prisma.masterAccount.findUnique({
      where: { id },
      select: { id: true, proxyPassword: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt) {
      throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
    }

    const account = await this.prisma.masterAccount.update({
      where: { id },
      data: this.normalizeProxyConfig(input, existing),
    });

    return {
      account: this.safeMasterAccount(account),
    };
  }

  async updateVaultData(actor: { userId: string; role: string }, id: string, input: { vaultData: string | null; syncCode?: string }) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    if (!input.syncCode || !this.redis) {
      throw forbidden("Authorization required for vault synchronization", "SYNC_AUTH_REQUIRED");
    }

    const syncGrant = await this.consumeSyncGrant(input.syncCode);
    if (!syncGrant || syncGrant.masterAccountId !== id || syncGrant.issuedToUserId !== actor.userId) {
      throw forbidden("Invalid or expired sync authorization", "SYNC_AUTH_FAILED");
    }

    validateCompleteVaultData(input.vaultData);

    const exists = await this.prisma.masterAccount.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
    }

    const updateData: any = { vaultData: null };
    if (input.vaultData) {
      const encrypted = encryptCookie(input.vaultData);
      updateData.encryptedCookie = encrypted.ciphertext;
      updateData.cookieNonce = encrypted.nonce;
      updateData.vaultVersion = { increment: 1 };
      updateData.vaultHealth = "COMPLETE";
      updateData.lastVaultSyncAt = new Date();
      updateData.status = MasterAccountStatus.ACTIVE;
    } else {
      updateData.encryptedCookie = "";
      updateData.cookieNonce = "";
      updateData.vaultHealth = "EMPTY";
      updateData.lastVaultSyncAt = null;
    }

    const account = await this.prisma.masterAccount.update({
      where: { id },
      data: updateData,
    });

    return {
      account: this.safeMasterAccount(account),
    };
  }

  async updateMasterAccountStatus(actor: { role: string }, id: string, status: "ACTIVE" | "DISABLED") {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const existing = await this.prisma.masterAccount.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
    }

    const account = await this.prisma.masterAccount.update({
      where: { id },
      data: { status: status as MasterAccountStatus },
    });

    if (status === "DISABLED") {
      await this.roundRobin?.removeFromActiveList(id).catch(() => undefined);
    }

    return {
      account: this.safeMasterAccount(account),
    };
  }

  /**
   * Soft-deletes the account: sets deletedAt instead of removing the row.
   * A hard delete would cascade-remove usageReports/leases (onDelete: Cascade
   * in schema.prisma), destroying billing/audit history. This way the account
   * disappears from getMasterAccounts()/findLeasableAccounts() immediately,
   * but revenue/usage history tied to its id stays intact and queryable.
   */
  async deleteMasterAccount(actor: { role: string }, id: string) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const account = await this.prisma.masterAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
    }

    if (account.deletedAt) {
      throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
    }

    await this.roundRobin?.removeFromActiveList(id).catch(() => undefined);
    const updated = await this.prisma.masterAccount.update({
      where: { id },
      data: { deletedAt: new Date(), status: MasterAccountStatus.DISABLED },
    });

    return {
      deleted: true,
      account: this.safeMasterAccount(updated),
    };
  }

  async generateKeeperKey(actor: { role: string }, masterAccountId: string) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    const account = await this.prisma.masterAccount.findUnique({
      where: { id: masterAccountId },
      select: { id: true },
    });

    if (!account) {
      throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
    }

    const keeperKey = nanoid(40);
    const keeperKeyHash = crypto.createHash("sha256").update(keeperKey).digest("hex");

    await this.prisma.masterAccount.update({
      where: { id: masterAccountId },
      data: { keeperKeyHash },
    });

    return { keeperKey };
  }

  async generateSyncCode(actor: { userId: string; role: string }, masterAccountId: string) {
    this.requireRole(actor, [Role.SUPER_ADMIN]);

    if (!this.redis) {
      throw badRequest("System cache is unavailable", "REDIS_UNAVAILABLE");
    }

    const account = await this.prisma.masterAccount.findUnique({
      where: { id: masterAccountId },
      select: { id: true },
    });

    if (!account) {
      throw notFound("Master account was not found", "MASTER_ACCOUNT_NOT_FOUND");
    }

    const code = nanoid(12).toUpperCase();
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
    const key = `sync:code:${hashedCode}`;

    await this.redis.set(key, JSON.stringify({ masterAccountId, issuedToUserId: actor.userId }), "EX", 300);

    return { code, expiresAt: new Date(Date.now() + 300 * 1000).toISOString() };
  }

  async analytics(actor: { userId: string; role: string }) {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);
    const customerWhere = this.customerScope(actor);

    const [totalUsers, usersPerPlan, resellerSales, users] = await Promise.all([
      this.prisma.user.count({ where: customerWhere }),
      this.prisma.user.groupBy({
        by: ["plan"],
        where: customerWhere,
        _count: {
          _all: true,
        },
      }),
      actor.role === Role.SUPER_ADMIN
        ? this.prisma.user.groupBy({
            by: ["createdByAdminId"],
            where: { role: Role.CUSTOMER },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      this.prisma.user.findMany({
        where: customerWhere,
        select: this.safeUserSelect(),
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const planConfigs = await this.prisma.planConfig.findMany();
    const priceByPlan = new Map(planConfigs.map((config) => [config.plan, config.priceCents]));
    const estimatedRevenueCents = usersPerPlan.reduce((sum, row) => {
      return sum + row._count._all * (priceByPlan.get(row.plan) ?? 0);
    }, 0);

    return {
      totalUsers,
      usersPerPlan,
      estimatedRevenueCents,
      resellerSales,
      users: users.map((user) => toUserDashboardSummary(user)),
    };
  }

  async revenueReport(actor: { userId: string; role: string }) {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);
    const customerWhere = this.customerScope(actor);
    const now = new Date();

    const [planConfigs, users] = await Promise.all([
      this.prisma.planConfig.findMany(),
      this.prisma.user.findMany({
        where: customerWhere,
        select: { plan: true, createdAt: true, validUntil: true },
      }),
    ]);

    const priceByPlan = new Map(planConfigs.map((config) => [config.plan, config.priceCents]));

    let activeRevenueCents = 0;
    let activeUsersCount = 0;
    const dailyMap = new Map<string, { revenueCents: number; count: number }>();
    const monthlyMap = new Map<string, { revenueCents: number; count: number }>();

    for (const user of users) {
      const price = priceByPlan.get(user.plan) ?? 0;

      if (user.validUntil > now) {
        activeRevenueCents += price;
        activeUsersCount += 1;
      }

      const dayKey = this.karachiDateKey(user.createdAt);
      const monthKey = dayKey.slice(0, 7);

      const dayEntry = dailyMap.get(dayKey) ?? { revenueCents: 0, count: 0 };
      dayEntry.revenueCents += price;
      dayEntry.count += 1;
      dailyMap.set(dayKey, dayEntry);

      const monthEntry = monthlyMap.get(monthKey) ?? { revenueCents: 0, count: 0 };
      monthEntry.revenueCents += price;
      monthEntry.count += 1;
      monthlyMap.set(monthKey, monthEntry);
    }

    const daily = [...dailyMap.entries()]
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 30);

    const monthly = [...monthlyMap.entries()]
      .map(([month, value]) => ({ month, ...value }))
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .slice(0, 12);

    return {
      activeRevenueCents,
      activeUsersCount,
      daily,
      monthly,
    };
  }

  async listUsers(actor: { userId: string; role: string }, filter: "active" | "expired" | "pending-manual") {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);
    const now = new Date();
    const baseWhere = this.customerScope(actor);

    const users = await this.prisma.user.findMany({
      where: {
        ...baseWhere,
        ...(filter === "active" ? { validUntil: { gt: now } } : {}),
        ...(filter === "expired" ? { validUntil: { lt: now } } : {}),
        ...(filter === "pending-manual"
          ? {
              validUntil: { lt: now },
              isManuallyDisabled: false,
            }
          : {}),
      },
      select: this.safeUserSelect(),
      orderBy: filter === "active" ? { validUntil: "asc" } : { validUntil: "desc" },
    });

    return {
      filter,
      count: users.length,
      users: users.map((user) => toUserDashboardSummary(user, now)),
    };
  }

  async updateUserManualStatus(actor: { userId: string; role: string }, userId: string, isManuallyDisabled: boolean) {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);
    const existing = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...this.customerScope(actor),
      },
      select: { id: true },
    });

    if (!existing) {
      throw forbidden("User is outside this admin scope", "USER_SCOPE_FORBIDDEN");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isManuallyDisabled,
      },
      select: this.safeUserSelect(),
    });

    return {
      user: toUserDashboardSummary(user),
    };
  }

  async deleteCustomerUser(actor: { userId: string; role: string }, userId: string) {
    this.requireRole(actor, [Role.SUPER_ADMIN, Role.ADMIN]);
    const existing = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...this.customerScope(actor),
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdByAdminId: true,
      },
    });

    if (!existing) {
      throw forbidden("User is outside this admin scope", "USER_SCOPE_FORBIDDEN");
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      deleted: true,
      user: existing,
    };
  }

  private requireRole(actor: { role: string }, allowed: Role[]) {
    if (!allowed.includes(actor.role as Role)) {
      throw forbidden("Admin permission required", "ADMIN_PERMISSION_REQUIRED");
    }
  }

  private customerScope(actor: { userId: string; role: string }) {
    return actor.role === Role.SUPER_ADMIN
      ? { role: Role.CUSTOMER }
      : {
          role: Role.CUSTOMER,
          createdByAdminId: actor.userId,
        };
  }

  private daysFromNow(days: number) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async getDefaultGeneratedUserValidDays(fallback = defaultGeneratedUserValidDays) {
    const config = await this.prisma.appConfig.findUnique({
      where: { key: generatedUserDefaultsConfigKey },
      select: { value: true },
    });

    return this.normalizeValidDays(this.readValidDaysConfig(config?.value) ?? fallback);
  }

  private readValidDaysConfig(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const validDays = (value as { validDays?: unknown }).validDays;
    return typeof validDays === "number" ? validDays : null;
  }

  private normalizeValidDays(value: number) {
    if (!Number.isFinite(value)) {
      return defaultGeneratedUserValidDays;
    }

    return Math.max(1, Math.min(3650, Math.round(value)));
  }

  private async resolvePlanCredits(plan: PlanType) {
    const planConfig = await this.prisma.planConfig.findUnique({
      where: { plan },
      select: { creditsLimit: true },
    });

    return planConfig?.creditsLimit ?? defaultPlanCredits[plan];
  }

  private karachiDayWindow(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    const year = part("year");
    const month = part("month");
    const day = part("day");
    const start = new Date(Date.UTC(year, month - 1, day, -karachiUtcOffsetHours));
    return [start, new Date(start.getTime() + dayMs)] as const;
  }

  private karachiDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  private async generateUniqueVirtualEmail() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const email = `user_${nanoid(12).toLowerCase()}@${env.VIRTUAL_EMAIL_DOMAIN.toLowerCase()}`;
      const exists = await this.prisma.user.findUnique({ where: { email } });
      if (!exists) {
        return email;
      }
    }

    return `user_${Date.now()}_${nanoid(8).toLowerCase()}@${env.VIRTUAL_EMAIL_DOMAIN.toLowerCase()}`;
  }

  private async consumeSyncGrant(syncCode: string) {
    if (!this.redis) {
      return null;
    }

    const hashedCode = crypto.createHash("sha256").update(syncCode).digest("hex");
    const rawGrant = await (this.redis as any).getdel(`sync:code:${hashedCode}`);

    if (!rawGrant) {
      return null;
    }

    try {
      const grant = JSON.parse(rawGrant) as { masterAccountId?: unknown; issuedToUserId?: unknown };
      if (typeof grant.masterAccountId !== "string" || typeof grant.issuedToUserId !== "string") {
        return null;
      }

      return {
        masterAccountId: grant.masterAccountId,
        issuedToUserId: grant.issuedToUserId,
      };
    } catch {
      return null;
    }
  }

  private safeMasterAccount(account: MasterAccount, capacity?: { activeJobCount: number; capacityLimit: number }) {
    return {
      id: account.id,
      provider: account.provider,
      email: account.email,
      status: account.status,
      dailyLimit: account.dailyLimit,
      remainingLimit: account.remainingLimit,
      cooldownUntil: account.cooldownUntil?.toISOString() ?? null,
      lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
      hasVaultData: Boolean(account.encryptedCookie && account.cookieNonce),
      vaultVersion: account.vaultVersion,
      vaultHealth: account.vaultHealth,
      lastVaultSyncAt: account.lastVaultSyncAt?.toISOString() ?? null,
      proxyHost: account.proxyHost,
      proxyPort: account.proxyPort,
      proxyUsername: account.proxyUsername,
      hasProxyPassword: Boolean(account.proxyPassword),
      activeJobCount: capacity?.activeJobCount ?? 0,
      capacityLimit: capacity?.capacityLimit ?? Math.min(env.PROVIDER_INFLIGHT_JOB_CAPACITY, Math.max(0, account.remainingLimit)),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  private normalizeProxyConfig(input: ProxyConfigInput, existing?: ExistingProxyConfig) {
    const proxyHost = this.cleanOptionalString(input.proxyHost);
    if (!proxyHost) {
      return {
        proxyHost: null,
        proxyPort: null,
        proxyUsername: null,
        proxyPassword: null,
      };
    }

    const proxyUsername = this.cleanOptionalString(input.proxyUsername);
    const incomingPassword = this.cleanOptionalString(input.proxyPassword);
    const proxyPassword = proxyUsername ? incomingPassword ?? existing?.proxyPassword ?? null : null;

    if (proxyUsername && !proxyPassword) {
      throw badRequest("Proxy username and password must be provided together", "INVALID_PROXY_CONFIG");
    }

    return {
      proxyHost,
      proxyPort: input.proxyPort ?? null,
      proxyUsername,
      proxyPassword,
    };
  }

  private cleanOptionalString(value: string | null | undefined) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private safeUserSelect() {
    return {
      id: true,
      email: true,
      role: true,
      plan: true,
      validUntil: true,
      isManuallyDisabled: true,
      createdByAdminId: true,
      creditsLimit: true,
      creditsUsed: true,
      createdAt: true,
    } as const;
  }
}
