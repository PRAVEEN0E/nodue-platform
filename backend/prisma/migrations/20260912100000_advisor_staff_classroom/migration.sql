-- AlterTable
ALTER TABLE "Staff" ADD COLUMN "classroomId" TEXT;

-- Backfill: assign each staff member to the classroom of their most recent
-- subject mapping so advisor staff lists and dashboard counts stay consistent
-- with the existing subjectStaff-derived classroom scope. Staff without any
-- classroom mapping remain NULL (unassigned pool).
UPDATE "Staff" s
SET "classroomId" = sub."cid"
FROM (
  SELECT DISTINCT ON (ss."staffId") ss."staffId" AS "sid", "Subject"."classroomId" AS "cid"
  FROM "SubjectStaff" ss
  JOIN "Subject" ON "Subject"."id" = ss."subjectId"
  WHERE "Subject"."classroomId" IS NOT NULL
  ORDER BY ss."staffId", ss."createdAt" DESC, ss."id"
) sub
WHERE s."id" = sub."sid" AND s."classroomId" IS NULL;

-- CreateIndex
CREATE INDEX "Staff_classroomId_idx" ON "Staff"("classroomId");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;