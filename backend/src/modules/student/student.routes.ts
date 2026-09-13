import { FastifyPluginAsync } from "fastify";
import { Role } from "@prisma/client";
import { studentController } from "./student.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateQuery, validateParams } from "../../utils/validate";
import {
  getStudentSubjectsQuerySchema,
  subjectIdParamSchema,
  GetStudentSubjectsQuery,
} from "./student.schema";

// Phase 6 is strictly view-only: only GET routes exist in this module.
// Any POST/PATCH/PUT/DELETE to these paths falls through to 404, and all
// data is scoped to the authenticated student's own record.
const studentGuard = [authenticate, authorize(Role.STUDENT)];

export const studentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/dashboard", { preHandler: studentGuard }, studentController.getDashboard);

  fastify.get("/profile", { preHandler: studentGuard }, studentController.getProfile);

  fastify.get<{ Querystring: GetStudentSubjectsQuery }>(
    "/subjects",
    {
      preHandler: studentGuard,
      preValidation: [validateQuery(getStudentSubjectsQuerySchema)],
    },
    studentController.getSubjects
  );

  fastify.get<{ Params: { id: string } }>(
    "/subjects/:id",
    {
      preHandler: studentGuard,
      preValidation: [validateParams(subjectIdParamSchema)],
    },
    studentController.getSubjectById
  );

  fastify.get("/status", { preHandler: studentGuard }, studentController.getStatus);
};
