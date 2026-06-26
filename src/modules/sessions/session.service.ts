import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { notFound } from "../../utils/errors.js";
import { DeviceService } from "../devices/device.service.js";
import { MasterAccountService } from "../master-accounts/master-account.service.js";
import { assertSubscriptionActive } from "../subscriptions/subscription.service.js";
import { UsageService, type ProviderOutcome } from "../usage/usage.service.js";

export class SessionService {
  private readonly deviceService: DeviceService;
  private readonly masterAccountService: MasterAccountService;
  private readonly usageService: UsageService;

  constructor(
    private readonly prisma: PrismaClient,
    redis: Redis,
  ) {
    this.deviceService = new DeviceService(prisma, redis);
    this.masterAccountService = new MasterAccountService(prisma, redis);
    this.usageService = new UsageService(prisma, redis);
  }

  async leaseAccount(auth: { userId: string; fingerprintId: string }) {
    await this.assertUserCanUseSession(auth.userId);
    await this.deviceService.verifyRegisteredDevice(auth.userId, auth.fingerprintId);
    return this.masterAccountService.leaseAccount(auth);
  }

  async reportUsage(
    auth: { userId: string; fingerprintId: string },
    input: {
      leaseId: string;
      outcome?: ProviderOutcome;
      usageUnits?: number;
      providerStatusCode?: number;
      providerErrorType?: string;
      providerMessage?: string;
      retryAfterSeconds?: number;
    },
  ) {
    await this.assertUserCanUseSession(auth.userId);
    await this.deviceService.verifyRegisteredDevice(auth.userId, auth.fingerprintId);
    return this.usageService.reportUsage({
      userId: auth.userId,
      fingerprintId: auth.fingerprintId,
      ...input,
    });
  }

  async releaseUsage(
    auth: { userId: string; fingerprintId: string },
    input: { leaseId: string; submitted?: boolean },
  ) {
    await this.assertUserCanUseSession(auth.userId);
    await this.deviceService.verifyRegisteredDevice(auth.userId, auth.fingerprintId);
    await this.masterAccountService.releaseAccount(input.leaseId, {
      userId: auth.userId,
      submitted: input.submitted,
    });
    return { released: true };
  }

  private async assertUserCanUseSession(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw notFound("User was not found", "USER_NOT_FOUND");
    }

    assertSubscriptionActive(user);
  }
}
