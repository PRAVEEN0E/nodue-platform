-- CreateIndex (scoped fee lists filter student + status)
CREATE INDEX "Fee_studentId_status_idx" ON "Fee"("studentId", "status");

-- CreateIndex (decided-approval lists filter subject + role + status)
CREATE INDEX "Approval_subjectId_approverRole_status_idx" ON "Approval"("subjectId", "approverRole", "status");
