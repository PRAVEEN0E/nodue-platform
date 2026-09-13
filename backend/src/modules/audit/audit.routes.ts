import { FastifyPluginAsync } from "fastify";
import { prisma } from "../../plugins/database";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { Role } from "@prisma/client";

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/audit - Restricted strictly to ADMIN role
  fastify.get(
    "/",
    {
      preHandler: [authenticate, authorize(Role.ADMIN)],
    },
    async (request, reply) => {
      const logs = await prisma.auditLog.findMany({
        take: 50,
        orderBy: { createdAt: "desc" },
        include: {
          actorUser: {
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
          },
        },
      });

      return reply.send({
        success: true,
        data: logs,
      });
    }
  );
};
