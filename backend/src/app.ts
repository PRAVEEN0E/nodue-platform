import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { env } from "./config/env";
import authPlugin from "./plugins/auth";
import { rateLimitRedis } from "./plugins/redis";
import { errorHandler } from "./utils/errorHandler";
import { NotFoundError } from "./utils/errors";
import { recordRequest, recordLatencySample } from "./utils/metrics";

// Module routes
import { healthRoutes } from "./modules/health/health.routes";
import { metricsRoutes } from "./modules/metrics/metrics.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { departmentRoutes } from "./modules/departments/department.routes";
import { classroomRoutes } from "./modules/classrooms/classroom.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { hodRoutes } from "./modules/hod/hod.routes";
import { advisorRoutes } from "./modules/advisor/advisor.routes";
import { staffRoutes } from "./modules/staff/staff.routes";
import { studentRoutes } from "./modules/student/student.routes";

// Localhost origins are allowed for development only. Production and
// staging must set CORS_ORIGIN explicitly; credentialed requests never
// use a wildcard.
function allowedOrigins(): string[] {
  const configured = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  const origins = [...configured];
  if (env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  return [...new Set(origins)];
}

// Localhost bypass exists so local development and E2E suites are not
// throttled. Override with RATE_LIMIT_ALLOWLIST (comma-separated, empty =
// no bypass) for shared staging or production-like verification.
function rateLimitAllowList(): string[] {
  if (env.RATE_LIMIT_ALLOWLIST !== undefined) {
    return env.RATE_LIMIT_ALLOWLIST.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return env.NODE_ENV === "production" ? [] : ["127.0.0.1", "localhost"];
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    // Globally unique request IDs for log/error correlation across
    // instances and restarts (Fastify's default is per-process sequential).
    genReqId: () => randomUUID(),
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn",
      transport:
        env.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
    disableRequestLogging: false,
    bodyLimit: 1048576, // 1MB body limit for security
  });

  // Security Headers via Helmet
  app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === "production",
    crossOriginEmbedderPolicy: false,
  });

  // CORS Configuration
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins().includes(origin)) {
        return cb(null, true);
      }
      cb(new Error("CORS policy violation"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Distributed rate limiting (shared Redis counters across instances).
  // skipOnError is an explicit availability decision: if Redis is down,
  // requests are allowed rather than failing every user with 500s. The
  // brute-force window this opens is bounded by the outage itself, and
  // Argon2 hashing plus per-route budgets still apply when Redis is up.
  app.register(rateLimit, {
    max: 100, // 100 requests per minute
    timeWindow: "1 minute",
    allowList: rateLimitAllowList(),
    redis: rateLimitRedis,
    nameSpace: "nodue-ratelimit-",
    skipOnError: true,
  });

  // Multipart form data support (up to 5MB for bulk CSV/Excel uploads)
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  // Request observability: correlation header + latency/status aggregates.
  // Hooks are intentionally tiny (timestamp + counters) to stay off the hot path.
  app.addHook("onRequest", async (request) => {
    (request as unknown as { metricsStart?: number }).metricsStart = performance.now();
  });
  app.addHook("onSend", async (request, reply, payload) => {
    const start = (request as unknown as { metricsStart?: number }).metricsStart;
    if (start !== undefined) {
      const ms = performance.now() - start;
      recordRequest(reply.statusCode, ms, request.raw.url ?? "");
      recordLatencySample(ms);
    }
    reply.header("x-request-id", request.id);
    return payload;
  });

  // Authentication Plugin (Cookies + JWT)
  app.register(authPlugin);

  // Centralized Error Handler
  app.setErrorHandler(errorHandler);

  // 404 Handler
  app.setNotFoundHandler((request, reply) => {
    throw new NotFoundError(`Route ${request.method} ${request.url} not found`);
  });

  // Health and Readiness probes at root
  app.register(healthRoutes);

  // Operational metrics (aggregates only, unauthenticated by design)
  app.register(metricsRoutes);

  // API v1 Modules
  app.register(
    async (v1) => {
      v1.register(healthRoutes, { prefix: "/health" });
      v1.register(authRoutes, { prefix: "/auth" });
      v1.register(departmentRoutes, { prefix: "/departments" });
      v1.register(classroomRoutes, { prefix: "/classrooms" });
      v1.register(auditRoutes, { prefix: "/audit" });
      v1.register(adminRoutes, { prefix: "/admin" });
      v1.register(hodRoutes, { prefix: "/hod" });
      v1.register(advisorRoutes, { prefix: "/advisor" });
      v1.register(staffRoutes, { prefix: "/staff" });
      v1.register(studentRoutes, { prefix: "/student" });
    },
    { prefix: "/api/v1" }
  );

  return app;
}
