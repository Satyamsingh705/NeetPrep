import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const cachedPrisma = globalForPrisma.prisma;

function hasRequiredDelegates(client: PrismaClient | undefined): client is PrismaClient {
  if (!client) {
    return false;
  }

  const prismaWithDelegates = client as PrismaClient & {
    student?: unknown;
    admin?: unknown;
    testSeriesGroup?: unknown;
    testSeriesDocument?: unknown;
  };

  return [
    prismaWithDelegates.student,
    prismaWithDelegates.admin,
    prismaWithDelegates.testSeriesGroup,
    prismaWithDelegates.testSeriesDocument,
  ].every((delegate) => typeof delegate !== "undefined");
}

let prismaClient: PrismaClient;

if (hasRequiredDelegates(cachedPrisma)) {
  prismaClient = cachedPrisma;
} else {
  prismaClient = createPrismaClient();
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
