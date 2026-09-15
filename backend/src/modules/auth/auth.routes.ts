import { FastifyPluginAsync } from "fastify";
import { authController } from "./auth.controller";
import {
  LoginInput,
  loginSchema,
  ChangePasswordInput,
  changePasswordSchema,
  RevokeSessionParams,
  revokeSessionParamsSchema,
  RevokeAllSessionsBody,
  revokeAllSessionsBodySchema,
} from "./auth.schema";
import { validateBody, validateParams } from "../../utils/validate";
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

  fastify.post<{ Body: ChangePasswordInput }>(
    "/change-password",
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      preValidation: [validateBody(changePasswordSchema)],
    },
    authController.changePassword
  );

  fastify.get(
    "/sessions",
    {
      preHandler: [authenticate],
    },
    authController.getActiveSessions
  );

  fastify.delete<{ Params: RevokeSessionParams }>(
    "/sessions/:sessionId",
    {
      preHandler: [authenticate],
      preValidation: [validateParams(revokeSessionParamsSchema)],
    },
    authController.revokeSession
  );

  fastify.post<{ Body: RevokeAllSessionsBody }>(
    "/sessions/revoke-all",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(revokeAllSessionsBodySchema)],
    },
    authController.revokeAllSessions
  );
};
