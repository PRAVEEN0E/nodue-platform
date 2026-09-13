import { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../utils/errors";
import { prisma } from "../plugins/database";
import { cacheService } from "../plugins/redis";
import { Role } from "@prisma/client";

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  let token: string | undefined;

  // 1. First priority: HttpOnly cookie
  if (request.cookies && request.cookies.access_token) {
    token = request.cookies.access_token;
  }
  // 2. Fallback: Authorization Bearer header (for mobile/API clients)
  else if (request.headers.authorization && request.headers.authorization.startsWith("Bearer ")) {
    token = request.headers.authorization.substring(7);
  }

  if (!token) {
    throw new UnauthorizedError("Authentication required. No session token provided.");
  }

  try {
    const decoded = request.server.jwt.verify<{
      userId: string;
      email: string;
      role: Role;
      departmentId?: string | null;
    }>(token);

    // Check cached active status or verify against DB to support instant revocation / account suspension
    const cacheKey = `user:active:${decoded.userId}`;
    let isActive = await cacheService.get<boolean>(cacheKey);

    if (isActive === null) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { isActive: true, role: true, departmentId: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedError("User account is inactive or no longer exists.");
      }

      // Update token payload if role changed in DB
      decoded.role = user.role;
      decoded.departmentId = user.departmentId;

      // Cache active status for 60 seconds
      await cacheService.set(cacheKey, user.isActive, 60);
    } else if (!isActive) {
      throw new UnauthorizedError("User account is inactive or disabled.");
    }

    request.user = decoded;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    throw new UnauthorizedError("Invalid or expired session token.");
  }
}
