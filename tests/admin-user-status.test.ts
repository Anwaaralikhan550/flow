import { describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/modules/admin/admin.service.js";

describe("AdminService generated user settings", () => {
  it("uses backend AppConfig validity days when generating a user", async () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-01T00:00:00.000Z").getTime());

    const prisma = {
      appConfig: {
        findUnique: vi.fn().mockResolvedValue({ value: { validDays: 45 } }),
      },
      planConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "customer-1",
          email: "user_abc123456789@vidgen.fun",
          role: "CUSTOMER",
          plan: "PRO",
          validUntil: new Date("2026-07-16T00:00:00.000Z"),
          isManuallyDisabled: false,
          createdByAdminId: "admin-1",
          creditsLimit: 100,
          creditsUsed: 0,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      },
    };

    const service = new AdminService(prisma as never);
    await service.generateUser({ userId: "admin-1", role: "ADMIN" }, { plan: "PRO" });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          validUntil: new Date("2026-07-16T00:00:00.000Z"),
        }),
      }),
    );

    dateNow.mockRestore();
  });

  it("saves generated user validity days in AppConfig", async () => {
    const prisma = {
      appConfig: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new AdminService(prisma as never);
    const result = await service.updateGeneratedUserSettings(
      { userId: "super-1", role: "SUPER_ADMIN" },
      { validDays: 60 },
    );

    expect(result).toEqual({ validDays: 60 });
    expect(prisma.appConfig.upsert).toHaveBeenCalledWith({
      where: { key: "generated_user_defaults" },
      update: {
        value: { validDays: 60 },
        updatedBy: "super-1",
      },
      create: {
        key: "generated_user_defaults",
        value: { validDays: 60 },
        updatedBy: "super-1",
      },
    });
  });
});

describe("AdminService.updateUserManualStatus", () => {
  it("sets the requested status instead of blindly toggling it", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: "customer-1" }),
        update: vi.fn().mockResolvedValue({
          id: "customer-1",
          email: "customer@example.com",
          role: "CUSTOMER",
          plan: "BASIC",
          validUntil: new Date("2026-07-01T00:00:00.000Z"),
          isManuallyDisabled: true,
          createdByAdminId: "admin-1",
          creditsLimit: 20,
          creditsUsed: 0,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      },
    };

    const service = new AdminService(prisma as never);
    await service.updateUserManualStatus(
      { userId: "admin-1", role: "ADMIN" },
      "customer-1",
      true,
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "customer-1" },
        data: { isManuallyDisabled: true },
      }),
    );
  });
});

describe("AdminService.deleteCustomerUser", () => {
  it("deletes a scoped customer user", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "customer-1",
          email: "customer@example.com",
          role: "CUSTOMER",
          createdByAdminId: "admin-1",
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };

    const service = new AdminService(prisma as never);
    const result = await service.deleteCustomerUser(
      { userId: "admin-1", role: "ADMIN" },
      "customer-1",
    );

    expect(result.deleted).toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: "customer-1",
        role: "CUSTOMER",
        createdByAdminId: "admin-1",
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdByAdminId: true,
      },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: "customer-1" },
    });
  });

  it("rejects delete outside admin scope", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
    };

    const service = new AdminService(prisma as never);
    await expect(service.deleteCustomerUser({ userId: "admin-1", role: "ADMIN" }, "customer-2"))
      .rejects.toThrow("User is outside this admin scope");
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
