import type { PrismaClient } from "@prisma/client";

export class DeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUser(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "asc" },
    });
  }

  touch(userId: string, fingerprintId: string) {
    return this.prisma.device.update({
      where: {
        userId_fingerprintId: {
          userId,
          fingerprintId,
        },
      },
      data: { lastSeenAt: new Date() },
    });
  }

  create(userId: string, fingerprintId: string) {
    return this.prisma.device.create({
      data: {
        userId,
        fingerprintId,
      },
    });
  }

  delete(userId: string, fingerprintId: string) {
    return this.prisma.device.delete({
      where: {
        userId_fingerprintId: {
          userId,
          fingerprintId,
        },
      },
    });
  }
}
