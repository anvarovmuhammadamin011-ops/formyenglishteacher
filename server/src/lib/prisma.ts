import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * The client is created lazily so `DATABASE_URL` can be resolved during
 * bootstrap (embedded PostgreSQL for local development) before the first query.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = create();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

export async function disconnectPrisma() {
  if (globalForPrisma.prisma) await globalForPrisma.prisma.$disconnect();
}
