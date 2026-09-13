import { FastifyPluginAsync } from "fastify";
import { metricsSnapshot } from "../../utils/metrics";
import { checkRedisHealth } from "../../plugins/redis";

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // Operational metrics. Intentionally unauthenticated (standard scraper
  // pattern) and aggregates-only: no PII, tokens, IPs, or request bodies.
  fastify.get("/metrics", async (request, reply) => {
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
