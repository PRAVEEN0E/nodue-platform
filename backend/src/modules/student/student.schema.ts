import { z } from "zod";

const paginationSchema = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

// NOTE: Phase 6 is strictly view-only. There are deliberately NO body
// schemas here — no POST/PATCH/PUT/DELETE routes exist in this module,
// so mutation requests cannot reach the service layer at all.

export const getStudentSubjectsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  semester: z.coerce.number().int().min(1).max(8).optional(),
});

export const subjectIdParamSchema = z.object({
  id: z.string().uuid("Invalid subject ID format"),
});

export type GetStudentSubjectsQuery = z.infer<typeof getStudentSubjectsQuerySchema>;
