-- AlterTable
ALTER TABLE "Fee" ADD COLUMN     "advisorApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hodApproved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);


-- Enforce one advisor decision per student (subject-less rows)
CREATE UNIQUE INDEX IF NOT EXISTS "Approval_advisor_per_student_key" ON "Approval"("studentId") WHERE "approverRole" = 'ADVISOR' AND "subjectId" IS NULL;

-- Enforce one HOD decision per student (subject-less rows)
CREATE UNIQUE INDEX IF NOT EXISTS "Approval_hod_per_student_key" ON "Approval"("studentId") WHERE "approverRole" = 'HOD' AND "subjectId" IS NULL;
