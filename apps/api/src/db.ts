import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as typeof globalThis & {
  automationPrisma?: PrismaClient;
};

export const prisma =
  globalDatabase.automationPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  });

if (process.env.NODE_ENV !== "production")
  globalDatabase.automationPrisma = prisma;
