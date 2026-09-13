import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

declare global {
  // eslint-disable-next-line no-var
  var prismaClientGlobal: PrismaClient | undefined;
}

const SLOW_QUERY_MS = 500;

export const prisma: PrismaClient =
  global.prismaClientGlobal ||
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
            { emit: "stdout", level: "warn" },
          ]
        : [{ emit: "stdout", level: "error" }],
  });

// Slow-query observability: counts queries over threshold into /metrics and
// warns with model/operation only (never parameters — may contain PII).
prisma.$use(async (params, next) => {
  const start = performance.now();
  try {
    return await next(params);
  } finally {
    const ms = performance.now() - start;
    if (ms > SLOW_QUERY_MS) {
      try {
        const { recordSlowQuery } = await import("../utils/metrics");
        recordSlowQuery();
      } catch {
        // Metrics must never break queries.
      }
      console.warn(
        `Slow query: ${params.model ?? "?"}.${
          params.action
        } took ${ms.toFixed(0)}ms (threshold ${SLOW_QUERY_MS}ms)`
      );
    }
  }
});

if (env.NODE_ENV !== "production") {
  global.prismaClientGlobal = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
