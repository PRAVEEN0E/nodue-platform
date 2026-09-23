import { prisma, connectDatabase, disconnectDatabase } from "./src/plugins/database";

async function main() {
  await connectDatabase();
  const departments = await prisma.department.findMany({
    select: { id: true, code: true, name: true, hodUserId: true },
    orderBy: { code: "asc" },
  });
  console.log(`=== DEPARTMENTS (${departments.length}) ===`);
  departments.forEach((d) => {
    console.log(`  [${d.code}] "${d.name}" (HOD: ${d.hodUserId ?? "None"})`);
  });

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true, passwordHash: true },
    orderBy: { email: "asc" },
  });
  console.log(`\n=== USERS (${users.length}) ===`);
  for (const u of users) {
    const { verifyPassword } = await import("./src/utils/password");
    const pwdOk = await verifyPassword(u.passwordHash, "Admin@12345");
    console.log(`  [${u.role}] ${u.email} (${u.firstName} ${u.lastName}, active: ${u.isActive}, Admin@12345 valid: ${pwdOk})`);
  }

  const counts = {
    students: await prisma.student.count(),
    staff: await prisma.staff.count(),
    advisors: await prisma.advisor.count(),
    classrooms: await prisma.classroom.count(),
    subjects: await prisma.subject.count(),
    fees: await prisma.fee.count(),
    feeVerifications: await prisma.feeVerification.count(),
    approvals: await prisma.approval.count(),
  };
  console.log("\n=== COUNTS ===", counts);

  await disconnectDatabase();
}

main().catch(console.error);
