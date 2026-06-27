import { describe, expect, it, vi } from "vitest";
import { BillingService } from "../src/modules/billing/billing.service.js";

describe("BillingService", () => {
  it("requires enough remaining credits for the configured generation cost before leasing", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "u1",
          role: "CUSTOMER",
          plan: "BASIC",
          creditsLimit: 20,
          creditsUsed: 5,
        }),
      },
    };
    const service = new BillingService(prisma as any);

    await expect(service.assertCanStartPremiumUsage({ userId: "u1", role: "CUSTOMER" }))
      .rejects.toThrow("Credit limit exceeded");
  });

  it("charges the exact accepted usage units for successful customer usage", async () => {
    const prisma = {
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new BillingService(prisma as any);

    await service.recordSuccessfulPremiumUsage({ userId: "u1", role: "CUSTOMER" }, 20);

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        role: "CUSTOMER",
      },
      data: {
        creditsUsed: {
          increment: 20,
        },
      },
    });
  });

  it("does not query or charge billing for admin actors", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    const service = new BillingService(prisma as any);

    await service.assertCanStartPremiumUsage({ userId: "a1", role: "SUPER_ADMIN" });
    await service.recordSuccessfulPremiumUsage({ userId: "a1", role: "SUPER_ADMIN" }, 20);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
