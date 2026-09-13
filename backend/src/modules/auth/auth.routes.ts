import { FastifyPluginAsync } from "fastify";
import { authController } from "./auth.controller";
import { LoginInput, loginSchema } from "./auth.schema";
import { validateBody } from "../../utils/validate";
import { authenticate } from "../../middleware/authenticate";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: LoginInput }>(
    "/login",
    {
      // Brute-force protection: strict per-IP budget on credential attempts.
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      preValidation: [validateBody(loginSchema)],
    },
    authController.login
  );

  fastify.post(
    "/refresh",
    {
      // Refresh abuse protection: generous budget for legitimate silent
      // refresh, tight enough to blunt token-spraying.
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    authController.refresh
  );

  fastify.post("/logout", authController.logout);

  fastify.get(
    "/me",
    {
      preHandler: [authenticate],
    },
    authController.me
  );
};
