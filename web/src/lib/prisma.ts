import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { assertDemoDatabase } from "./config/demo-environment";

if (process.env.NEXUS_DEMO_MODE === "true") assertDemoDatabase();

const defaultPoolMax = process.env.NODE_ENV === "production" ? 2 : 10;
const configuredPoolMax = process.env.DATABASE_POOL_MAX;
const poolMax = configuredPoolMax === undefined ? defaultPoolMax : Number(configuredPoolMax);

if (!Number.isSafeInteger(poolMax) || poolMax < 1) {
  throw new Error("DATABASE_POOL_MAX must be a positive integer.");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: poolMax,
});


export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
