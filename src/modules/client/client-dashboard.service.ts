import { LeaseStatus, type PrismaClient } from "@prisma/client";
import { ClientConfigService } from "./client-config.service.js";
import { notFound } from "../../utils/errors.js";
import { toUserDashboardSummary } from "../subscriptions/subscription.service.js";

export class ClientDashboardService {
  private readonly configService = new ClientConfigService();

  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard(auth: { userId: string; fingerprintId: string; role: string; plan: string; configHash: string }) {
    const [user, activeLease, recentUsage, usageTotals, deviceCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: auth.userId } }),
      this.prisma.masterAccountLease.findFirst({
        where: {
          userId: auth.userId,
          deviceFingerprintId: auth.fingerprintId,
          status: LeaseStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
        orderBy: { leasedAt: "desc" },
        include: {
          masterAccount: {
            select: {
              provider: true,
              status: true,
              remainingLimit: true,
            },
          },
        },
      }),
      this.prisma.usageReport.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          masterAccount: {
            select: {
              provider: true,
            },
          },
        },
      }),
      this.prisma.usageReport.groupBy({
        by: ["outcome"],
        where: { userId: auth.userId },
        _sum: { usageUnits: true },
        _count: { _all: true },
      }),
      this.prisma.device.count({ where: { userId: auth.userId } }),
    ]);

    if (!user) {
      throw notFound("User was not found", "USER_NOT_FOUND");
    }

    const { config, configHash } = this.configService.getConfigWithHash({
      role: user.role,
      plan: user.plan,
    });
    const userSummary = toUserDashboardSummary(user);
    const used = usageTotals.reduce((total, row) => total + (row._sum.usageUnits ?? 0), 0);
    const successful = usageTotals.find((row) => row.outcome === "SUCCESS")?._count._all ?? 0;
    const failed = usageTotals
      .filter((row) => row.outcome !== "SUCCESS")
      .reduce((total, row) => total + row._count._all, 0);

    return {
      user: {
        ...userSummary,
        validUntil: user.validUntil.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      config,
      configHash,
      credits: {
        limit: user.creditsLimit,
        used: user.creditsUsed,
        remaining: Math.max(0, user.creditsLimit - user.creditsUsed),
        usageUnitsReported: used,
      },
      activeLease: activeLease
        ? {
            leaseId: activeLease.id,
            provider: activeLease.masterAccount.provider,
            providerStatus: activeLease.masterAccount.status,
            remainingLimit: activeLease.masterAccount.remainingLimit,
            leasedAt: activeLease.leasedAt.toISOString(),
            expiresAt: activeLease.expiresAt.toISOString(),
          }
        : null,
      history: recentUsage.map((report) => ({
        id: report.id,
        outcome: report.outcome,
        usageUnits: report.usageUnits,
        provider: report.masterAccount.provider,
        providerStatusCode: report.providerStatusCode,
        providerErrorType: report.providerErrorType,
        providerMessage: report.providerMessage,
        createdAt: report.createdAt.toISOString(),
      })),
      diagnostics: {
        backendReachable: true,
        authenticated: true,
        policyLoaded: Boolean(config),
        policyHashMatchesToken: auth.configHash === configHash,
        leaseActive: Boolean(activeLease),
        registeredDevices: deviceCount,
        fingerprintId: auth.fingerprintId,
      },
      stats: {
        successfulReports: successful,
        failedReports: failed,
      },
    };
  }
}
