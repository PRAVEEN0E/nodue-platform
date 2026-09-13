-- CreateTable
CREATE TABLE "FeeVerification" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "advisorApproved" BOOLEAN NOT NULL DEFAULT false,
    "hodApproved" BOOLEAN NOT NULL DEFAULT false,
    "advisorById" TEXT,
    "hodById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeVerification_studentId_key" ON "FeeVerification"("studentId");

-- CreateIndex
CREATE INDEX "FeeVerification_studentId_idx" ON "FeeVerification"("studentId");

-- AddForeignKey
ALTER TABLE "FeeVerification" ADD CONSTRAINT "FeeVerification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

