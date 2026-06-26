import { Role, type PrismaClient } from "@prisma/client";
import { forbidden, notFound } from "../../utils/errors.js";

const customerRole = Role.CUSTOMER;

export class BillingService {
  constructor(private readonly prisma: PrismaClient) {}

  async assertCanStartPremiumUsage(auth: { userId: string; role: string }) {
    if (auth.role !== customerRole) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        creditsLimit: true,
        creditsUsed: true,
      },
    });

    if (!user) {
      throw notFound("User was not found", "USER_NOT_FOUND");
    }

    if (user.creditsUsed >= user.creditsLimit) {
      throw forbidden("Credit limit exceeded", "CREDIT_LIMIT_EXCEEDED");
    }
  }

  async recordSuccessfulPremiumUsage(auth: { userId: string; role: string }) {
    if (auth.role !== customerRole) {
      return;
    }

    const updated = await this.prisma.user.updateMany({
      where: {
        id: auth.userId,
        role: customerRole,
      },
      data: {
        creditsUsed: {
          increment: 1,
        },
      },
    });

    if (updated.count === 0) {
      throw notFound("User was not found", "USER_NOT_FOUND");
    }
  }
}
