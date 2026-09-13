import { FastifyReply, FastifyRequest } from "fastify";
import { Role } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";

export function authorize(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError("User is not authenticated");
    }

    if (!allowedRoles.includes(request.user.role)) {
      request.log.warn({
        userId: request.user.userId,
        userRole: request.user.role,
        requiredRoles: allowedRoles,
        path: request.url,
      }, "RBAC authorization denied");

      throw new ForbiddenError(
        `Access denied. Role '${request.user.role}' is not authorized to access this resource.`
      );
    }
  };
}
