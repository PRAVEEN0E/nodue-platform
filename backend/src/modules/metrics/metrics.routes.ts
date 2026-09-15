import { FastifyPluginAsync } from "fastify";
import { Role } from "@prisma/client";
import { metricsSnapshot } from "../../utils/metrics";
import { checkRedisHealth } from "../../plugins/redis";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // Operational metrics. Intentionally unauthenticated (standard scraper
  // pattern) and aggregates-only: no PII, tokens, IPs, or request bodies.
  // Restricted to ADMIN only — exposes internal infra telemetry
  fastify.get("/metrics", { preHandler: [authenticate, authorize(Role.ADMIN)] }, async (request, reply) => {
    const snapshot = metricsSnapshot();
    let redisLatencyMs: number | null = null;
    try {
      const start = performance.now();
      const ok = await checkRedisHealth();
      redisLatencyMs = ok ? Number((performance.now() - start).toFixed(2)) : null;
    } catch {
      redisLatencyMs = null;
    }
    return reply.status(200).send({
      ...snapshot,
      redis: { latencyMs: redisLatencyMs },
    });
  });
};
