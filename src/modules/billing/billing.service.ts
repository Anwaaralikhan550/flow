import { Role, type PrismaClient } from "@prisma/client";
import { forbidden, notFound } from "../../utils/errors.js";
import { ClientConfigService } from "../client/client-config.service.js";

const customerRole = Role.CUSTOMER;
const maxBillableUsageUnits = 100;

export class BillingService {
  private readonly clientConfig = new ClientConfigService();

  constructor(private readonly prisma: PrismaClient) {}

  async assertCanStartPremiumUsage(auth: { userId: string; role: string }) {
    if (auth.role !== customerRole) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        role: true,
        plan: true,
        creditsLimit: true,
        creditsUsed: true,
      },
    });

    if (!user) {
      throw notFound("User was not found", "USER_NOT_FOUND");
    }

    const configuredUsageUnits = this.clientConfig.getConfig({
      role: user.role,
      plan: user.plan,
    }).creditPolicy.generationLoopCredits;
    const requiredUsageUnits = this.normalizeUsageUnits(configuredUsageUnits);
    const remainingCredits = user.creditsLimit - user.creditsUsed;

    if (remainingCredits < requiredUsageUnits) {
      throw forbidden("Credit limit exceeded", "CREDIT_LIMIT_EXCEEDED");
    }
  }

  async recordSuccessfulPremiumUsage(auth: { userId: string; role: string }, usageUnits = 1) {
    if (auth.role !== customerRole) {
      return;
    }

    const chargedUsageUnits = this.normalizeUsageUnits(usageUnits);
    const updated = await this.prisma.user.updateMany({
      where: {
        id: auth.userId,
        role: customerRole,
      },
      data: {
        creditsUsed: {
          increment: chargedUsageUnits,
        },
      },
    });

    if (updated.count === 0) {
      throw notFound("User was not found", "USER_NOT_FOUND");
    }
  }

  private normalizeUsageUnits(value: number) {
    if (!Number.isFinite(value)) {
      return 1;
    }

    return Math.max(1, Math.min(maxBillableUsageUnits, Math.floor(value)));
  }
}
