import { Role, type PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { allowedEmailDomains, env } from "../../config/env.js";
import { forbidden, unauthorized } from "../../utils/errors.js";
import { consumeRefreshToken, issueTokenPair } from "../../utils/jwt.js";
import { verifyPassword } from "../../utils/password.js";
import { ClientConfigService } from "../client/client-config.service.js";
import { DeviceService } from "../devices/device.service.js";
import { assertSubscriptionActive, toUserDashboardSummary } from "../subscriptions/subscription.service.js";

export class AuthService {
  private readonly deviceService: DeviceService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.deviceService = new DeviceService(prisma, redis);
  }

  async login(input: { email: string; password: string; fingerprintId: string }) {
    const email = input.email.trim().toLowerCase();
    const domain = email.split("@")[1];

    if (!domain || !allowedEmailDomains.includes(domain)) {
      throw forbidden("Email domain is not allowed", "EMAIL_DOMAIN_NOT_ALLOWED");
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (user.role === Role.CUSTOMER && !this.isSystemGeneratedVirtualEmail(email)) {
      throw forbidden("Only system-generated virtual emails can authenticate", "VIRTUAL_EMAIL_REQUIRED");
    }

    assertSubscriptionActive(user);

    const validPassword = await verifyPassword(user.passwordHash, input.password);
    if (!validPassword) {
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    await this.deviceService.registerDevice(user.id, input.fingerprintId);
    const configService = new ClientConfigService();
    const { configHash } = configService.getConfigWithHash({
      role: user.role,
      plan: user.plan,
    });

    const tokens = await issueTokenPair(this.redis, {
      userId: user.id,
      fingerprintId: input.fingerprintId,
      role: user.role,
      plan: user.plan,
      validUntil: user.validUntil,
      configHash,
    });

    const userSummary = toUserDashboardSummary({
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      validUntil: user.validUntil,
      isManuallyDisabled: user.isManuallyDisabled,
      createdByAdminId: user.createdByAdminId,
      creditsLimit: user.creditsLimit,
      creditsUsed: user.creditsUsed,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });

    return {
      accessToken: tokens.accessToken.token,
      tokenType: tokens.accessToken.tokenType,
      expiresIn: tokens.accessToken.expiresIn,
      refreshToken: tokens.refreshToken.token,
      user: {
        ...userSummary,
        validUntil: user.validUntil.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    };
  }

  async refresh(refreshToken: string) {
    const refresh = await consumeRefreshToken(this.redis, refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: refresh.userId } });
    if (!user) {
      throw unauthorized("User was not found", "USER_NOT_FOUND");
    }

    assertSubscriptionActive(user);

    const configService = new ClientConfigService();
    const { configHash } = configService.getConfigWithHash({
      role: user.role,
      plan: user.plan,
    });
    const tokens = await issueTokenPair(this.redis, {
      userId: user.id,
      fingerprintId: refresh.fingerprintId,
      role: user.role,
      plan: user.plan,
      validUntil: user.validUntil,
      configHash,
    });

    return {
      accessToken: tokens.accessToken.token,
      tokenType: tokens.accessToken.tokenType,
      expiresIn: tokens.accessToken.expiresIn,
      refreshToken: tokens.refreshToken.token,
    };
  }

  private isSystemGeneratedVirtualEmail(email: string) {
    const [local, domain] = email.split("@");
    return domain === env.VIRTUAL_EMAIL_DOMAIN.toLowerCase() && /^user_[a-z0-9_-]{8,}$/i.test(local ?? "");
  }
}
