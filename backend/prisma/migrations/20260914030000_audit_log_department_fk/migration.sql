-- AlterTable: add departmentId column to AuditLog (idempotent)
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_departmentId_idx" ON "AuditLog"("departmentId");

-- CreateIndex (composite: used by per-department audit queries)
CREATE INDEX IF NOT EXISTS "AuditLog_departmentId_createdAt_idx" ON "AuditLog"("departmentId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_departmentId_fkey'
  ) THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
