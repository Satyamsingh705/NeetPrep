import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const databaseUrl = process.env.DATABASE_URL ?? "";
const directSupabaseHostPattern = /@db\.[^.]+\.supabase\.co:5432/i;

function warnIfRuntimeUsesDirectSupabaseHost() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (!databaseUrl || !directSupabaseHostPattern.test(databaseUrl)) {
    return;
  }

  console.warn(
    "[prisma] DATABASE_URL is using a direct Supabase host on port 5432. If that hostname does not resolve locally, Prisma reads will fail. Prefer the Supabase pooler URL for runtime and keep the direct URL only for DIRECT_URL.",
  );
}

function createPrismaClient() {
  warnIfRuntimeUsesDirectSupabaseHost();

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
