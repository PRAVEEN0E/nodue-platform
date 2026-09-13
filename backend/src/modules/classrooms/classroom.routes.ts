import { FastifyPluginAsync } from "fastify";
import { prisma } from "../../plugins/database";
import { authenticate } from "../../middleware/authenticate";
import { resourceScopeService } from "../../middleware/resourceScope";
import { z } from "zod";
import { validateParams } from "../../utils/validate";
import { NotFoundError } from "../../utils/errors";

const classroomParamSchema = z.object({
  id: z.string().uuid(),
});

export const classroomRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/:id",
    {
      preHandler: [authenticate],
      preValidation: [validateParams(classroomParamSchema)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Enforce classroom resource scope
      await resourceScopeService.enforceClassroomScope(request.user, id);

      const classroom = await prisma.classroom.findUnique({
        where: { id },
        include: {
          department: { select: { id: true, code: true, name: true } },
          advisor: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          students: {
            select: { id: true, registerNumber: true, rollNumber: true },
          },
        },
      });

      if (!classroom) {
        throw new NotFoundError("Classroom not found");
      }

      return reply.send({ success: true, data: classroom });
    }
  );
};
