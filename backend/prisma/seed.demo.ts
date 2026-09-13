import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

// ─── Demo / development seed (OPT-IN ONLY) ────────────────────────────────
// Creates local development fixtures: one role account per role plus a demo
// classroom with assignments. NEVER run against production.
// Usage:
//   npx tsx prisma/seed.demo.ts
// Requires the production seed (departments) to have run first.

async function main() {
  console.log("Seeding OPT-IN demo fixtures for local development...");

  const cseDept = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@institution.edu" },
    update: {},
    create: {
      email: "admin@institution.edu",
      passwordHash: await hashPassword("Admin@12345"),
      firstName: "Super",
      lastName: "Administrator",
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`  Demo user: ${adminUser.email} [${adminUser.role}]`);

  const hodUser = await prisma.user.upsert({
    where: { email: "hod.cse@institution.edu" },
    update: { isActive: true },
    create: {
      email: "hod.cse@institution.edu",
      passwordHash: await hashPassword("Hod@12345"),
      firstName: "Alan",
      lastName: "Turing (HOD)",
      role: Role.HOD,
      departmentId: cseDept.id,
      isActive: true,
    },
  });
  await prisma.department.update({
    where: { id: cseDept.id },
    data: { hodUserId: hodUser.id },
  });
  console.log(`  Demo user: ${hodUser.email} [${hodUser.role}] assigned as HOD of CSE`);

  let classroom = await prisma.classroom.findFirst({
    where: { name: "CSE-IV-A", departmentId: cseDept.id },
  });
  if (!classroom) {
    classroom = await prisma.classroom.create({
      data: {
        name: "CSE-IV-A",
        batch: "2023-2027",
        semester: 7,
        section: "A",
        departmentId: cseDept.id,
      },
    });
  }
  console.log(`  Demo classroom: ${classroom.name}`);

  const advisorUser = await prisma.user.upsert({
    where: { email: "advisor.cse@institution.edu" },
    update: {},
    create: {
      email: "advisor.cse@institution.edu",
      passwordHash: await hashPassword("Advisor@12345"),
      firstName: "Grace",
      lastName: "Hopper (Advisor)",
      role: Role.ADVISOR,
      departmentId: cseDept.id,
      isActive: true,
    },
  });
  await prisma.advisor.upsert({
    where: { userId: advisorUser.id },
    update: { classroomId: classroom.id },
    create: { userId: advisorUser.id, classroomId: classroom.id },
  });
  console.log(`  Demo user: ${advisorUser.email} [${advisorUser.role}] assigned to ${classroom.name}`);

  // Staff are created by ADMIN only and join the department's unassigned pool
  // (classroomId NULL). An advisor adopts an existing staff member into their
  // classroom only by mapping them to a subject in the advisor module.
  const staffUser = await prisma.user.upsert({
    where: { email: "staff.cse@institution.edu" },
    update: {},
    create: {
      email: "staff.cse@institution.edu",
      passwordHash: await hashPassword("Staff@12345"),
      firstName: "Claude",
      lastName: "Shannon (Staff)",
      role: Role.STAFF,
      departmentId: cseDept.id,
      isActive: true,
    },
  });
  await prisma.staff.upsert({
    where: { userId: staffUser.id },
    update: {},
    create: {
      userId: staffUser.id,
      employeeCode: "EMP-CSE-001",
      departmentId: cseDept.id,
      designation: "Assistant Professor",
    },
  });
  console.log(`  Demo user: ${staffUser.email} [${staffUser.role}]`);

  const studentUser = await prisma.user.upsert({
    where: { email: "student.cse@institution.edu" },
    update: {},
    create: {
      email: "student.cse@institution.edu",
      passwordHash: await hashPassword("Student@12345"),
      firstName: "Ada",
      lastName: "Lovelace (Student)",
      role: Role.STUDENT,
      departmentId: cseDept.id,
      isActive: true,
    },
  });
  await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      registerNumber: "927623CSR001",
      rollNumber: "23CSR001",
      classroomId: classroom.id,
      departmentId: cseDept.id,
      admissionYear: 2023,
    },
  });
  console.log(`  Demo user: ${studentUser.email} [${studentUser.role}]`);

  console.log("Demo seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Demo seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
