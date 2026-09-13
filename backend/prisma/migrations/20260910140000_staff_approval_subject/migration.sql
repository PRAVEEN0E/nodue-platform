-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "subjectId" TEXT;

-- CreateIndex
CREATE INDEX "Approval_subjectId_idx" ON "Approval"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_studentId_subjectId_approverRole_key" ON "Approval"("studentId", "subjectId", "approverRole");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

