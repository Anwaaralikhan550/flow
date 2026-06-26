import type { PrismaClient } from "@prisma/client";

export class UsageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createReport(input: {
    leaseId: string;
    userId: string;
    masterAccountId: string;
    deviceFingerprintId: string;
    outcome: string;
    usageUnits: number;
    providerStatusCode?: number;
    providerErrorType?: string;
    providerMessage?: string;
  }) {
    return (this.prisma.usageReport as any).create({
      data: input,
    });
  }

  findByLeaseId(leaseId: string) {
    return (this.prisma.usageReport as any).findUnique({
      where: { leaseId },
    });
  }
}
