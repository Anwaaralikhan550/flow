import { PrismaClient } from "@prisma/client";

export function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "error", "warn"],
  });
}
