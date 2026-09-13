import fp from "fastify-plugin";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import { FastifyPluginAsync } from "fastify";
import { env } from "../config/env";
import { Role } from "@prisma/client";

export interface AuthUserPayload {
  userId: string;
  email: string;
  role: Role;
  departmentId?: string | null;
}

export interface AdvisorScopePayload {
  advisorId: string;
  userId: string;
  classroomId: string;
  departmentId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUserPayload;
    departmentId?: string;
    advisorScope?: AdvisorScopePayload;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUserPayload;
    user: AuthUserPayload;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    parseOptions: {},
  });

  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: "access_token",
      signed: false,
    },
  });
};

export default fp(authPlugin, {
  name: "auth-plugin",
});
