-- CreateTable
CREATE TABLE "SubjectStaff" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectStaff_subjectId_idx" ON "SubjectStaff"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectStaff_staffId_idx" ON "SubjectStaff"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectStaff_subjectId_staffId_key" ON "SubjectStaff"("subjectId", "staffId");

-- AddForeignKey
ALTER TABLE "SubjectStaff" ADD CONSTRAINT "SubjectStaff_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectStaff" ADD CONSTRAINT "SubjectStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
