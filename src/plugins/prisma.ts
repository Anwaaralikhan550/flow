import fp from "fastify-plugin";
import { createPrismaClient } from "../config/prisma.js";

export const prismaPlugin = fp(async (app) => {
  const prisma = createPrismaClient();
  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});
