import { FastifyPluginAsync } from "fastify";
import { prisma } from "../../plugins/database";
import { cacheService } from "../../plugins/redis";
import { authenticate } from "../../middleware/authenticate";
import { resourceScopeService } from "../../middleware/resourceScope";
import { z } from "zod";
import { validateParams } from "../../utils/validate";
import { NotFoundError } from "../../utils/errors";

const deptParamSchema = z.object({
  id: z.string().uuid(),
});

export const departmentRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/departments - Cached list of departments
  fastify.get("/", async (request, reply) => {
    const cacheKey = "cache:departments:list";
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return reply.send({ success: true, source: "cache", data: cached });
    }

    const departments = await prisma.department.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        hodUserId: true,
        _count: { select: { classrooms: true, students: true, staff: true } },
      },
      orderBy: { code: "asc" },
    });

    await cacheService.set(cacheKey, departments, 3600); // 1 hour TTL
    return reply.send({ success: true, source: "database", data: departments });
  });

  // GET /api/v1/departments/:id - Scoped departmental detail
  fastify.get(
    "/:id",
    {
      preHandler: [authenticate],
      preValidation: [validateParams(deptParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Enforce resource-level scope (ADMIN or matching departmentId)
      await resourceScopeService.enforceDepartmentScope(request.user, id);

      const dept = await prisma.department.findUnique({
        where: { id },
        include: {
          hodUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          classrooms: {
            select: { id: true, name: true, batch: true, section: true },
          },
        },
      });

      if (!dept) {
        throw new NotFoundError("Department not found");
      }

      return reply.send({ success: true, data: dept });
    }
  );
};
