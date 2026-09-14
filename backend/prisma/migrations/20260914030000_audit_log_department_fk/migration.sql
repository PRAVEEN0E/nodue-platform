-- AlterTable: add departmentId column to AuditLog
ALTER TABLE "AuditLog" ADD COLUMN "departmentId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_departmentId_idx" ON "AuditLog"("departmentId");

-- CreateIndex (composite: used by per-department audit queries)
CREATE INDEX "AuditLog_departmentId_createdAt_idx" ON "AuditLog"("departmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
