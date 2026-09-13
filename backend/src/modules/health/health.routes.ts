import { FastifyPluginAsync } from "fastify";
import { checkDatabaseHealth } from "../../plugins/database";
import { checkRedisHealth } from "../../plugins/redis";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Liveness probe: verifies the node process is alive and responsive
  fastify.get("/health", async (request, reply) => {
    return reply.status(200).send({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: "academic-management-backend",
    });
  });

  // Readiness probe: verifies essential external services (Database & Redis)
  fastify.get("/ready", async (request, reply) => {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isReady = dbHealthy && redisHealthy;
    const statusCode = isReady ? 200 : 503;

    return reply.status(statusCode).send({
      status: isReady ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbHealthy ? "connected" : "disconnected",
        redis: redisHealthy ? "connected" : "disconnected",
      },
    });
  });
};
