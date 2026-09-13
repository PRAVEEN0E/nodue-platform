/* E2E seed: students with controlled Fee Verification state used by the
   "Remove Fees from Student Module" browser test.
     rmp@rmfee-e2e.verify.local  -> no feeVerification row (Fee Verification: Pending)
     rmv@rmfee-e2e.verify.local  -> feeVerification advisorApproved=true (Fee Verification: Verified)
   A real Fee record (₹ amounts) is attached to the verified student purely as
   a non-exposure probe: the student UI/API must never surface amounts.
   Idempotent: clears prior @rmfee-e2e.verify.local rows first.

   Run: npx tsx scripts/seed-remove-student-fees-e2e.ts */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();
const DOMAIN = "rmfee-e2e.verify.local";

async function main() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleaned ${ids.length} prior rmfee users`);
  }

  const passwordHash = await hashPassword("Student@12345");
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const demo = await prisma.student.findFirstOrThrow({
    where: { user: { email: "student.cse@institution.edu" } },
    select: { classroomId: true },
  });
  const TAG = Date.now().toString(36);

  const mkStudent = async (key: string, firstName: string, lastName: string) => {
    const su = await prisma.user.create({
      data: {
        firstName, lastName,
        email: `${key}@${DOMAIN}`,
        passwordHash, role: Role.STUDENT, departmentId: cse.id,
      },
    });
    return prisma.student.create({
      data: {
        userId: su.id,
        registerNumber: `RMFEE-${key.toUpperCase()}-${TAG}`,
        rollNumber: `RMFEE-${key.toUpperCase()}-${TAG}`,
        classroomId: demo.classroomId,
        departmentId: cse.id,
        admissionYear: 2023,
      },
    });
  };

  const pend = await mkStudent("rmp", "Removal", "Pending");
  const ver = await mkStudent("rmv", "Removal", "Verified");

  // Verified only (OR rule: advisor approved; hod not yet)
  await prisma.feeVerification.create({
    data: { studentId: ver.id, advisorApproved: true, hodApproved: false },
  });

  // Non-exposure probe: a real, charged fee record on the verified student.
  await prisma.fee.create({
    data: {
      studentId: ver.id,
      title: "E2E Tuition",
      totalAmount: 60000,
      paidAmount: 10000,
      status: "PARTIAL",
      dueDate: new Date("2027-01-31"),
    },
  });

  console.log(JSON.stringify({ pend: pend.id, ver: ver.id, classroomId: demo.classroomId }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await prisma.$disconnect();
  process.exit(1);
});