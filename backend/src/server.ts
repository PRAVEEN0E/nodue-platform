import { buildApp } from "./app";
import { env } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./plugins/database";
import { connectRedis, disconnectRedis } from "./plugins/redis";

async function bootstrap() {
  const app = buildApp();

  // 1. Establish resilient infrastructure connections
  try {
    await connectDatabase();
    app.log.info("✅ PostgreSQL Database connected successfully");
  } catch (err) {
    app.log.error({ err }, "❌ Failed to connect to PostgreSQL");
    process.exit(1);
  }

  await connectRedis();

  // 2. Start HTTP server
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 Server running in ${env.NODE_ENV} mode at http://${env.HOST}:${env.PORT}`);
    app.log.info(`🩺 Health check available at http://${env.HOST}:${env.PORT}/health`);
    app.log.info(`🩺 Readiness check available at http://${env.HOST}:${env.PORT}/ready`);
  } catch (err) {
    app.log.error({ err }, "❌ Server startup error");
    process.exit(1);
  }

  // 3. Graceful Shutdown Management
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`🛑 Received ${signal}, initiating graceful shutdown...`);

      try {
        // Stop accepting new connections and finish in-flight requests
        await app.close();
        app.log.info("✓ Fastify server closed");

        // Disconnect Redis
        await disconnectRedis();
        app.log.info("✓ Redis disconnected");

        // Disconnect Prisma PostgreSQL client
        await disconnectDatabase();
        app.log.info("✓ Prisma Database client disconnected");

        app.log.info("👋 Graceful shutdown complete. Process exiting.");
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, "❌ Error during graceful shutdown");
        process.exit(1);
      }
    });
  }
}

bootstrap();
