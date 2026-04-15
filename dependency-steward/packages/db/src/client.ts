import { PrismaClient } from "@prisma/client";

declare global {
  var __dependencyStewardPrisma__: PrismaClient | undefined;
}

export const prisma = globalThis.__dependencyStewardPrisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__dependencyStewardPrisma__ = prisma;
}