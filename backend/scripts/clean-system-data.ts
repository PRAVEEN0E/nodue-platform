import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

const OFFICIAL_DEPARTMENTS = [
  { code: "AIML", name: "Artificial Intelligence and Machine Learning" },
  { code: "AIDS", name: "Artificial Intelligence and Data Science" },
  { code: "CSE", name: "Computer Science and Engineering" },
  { code: "IT", name: "Information Technology" },
  { code: "MECH", name: "Mechanical Engineering" },
  { code: "BME", name: "Biomedical Engineering" },
  { code: "MDE", name: "Medical Electronics Engineering" },
  { code: "CIVIL", name: "Civil Engineering" },
  { code: "CYBER SECURITY", name: "Cyber Security" },
  { code: "ECE", name: "Electronics and Communication Engineering" },
  { code: "EEE", name: "Electrical and Electronics Engineering" },
];

const OFFICIAL_CODES = OFFICIAL_DEPARTMENTS.map((d) => d.code);

async function main() {
  console.log("=== STARTING SYSTEM DATA CLEANUP ===");

  // 1. Ensure Admin exists first
  console.log("Checking Admin account...");
  let admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  if (!admin) {
    console.log("Admin account not found. Creating default admin account...");
    const adminPasswordHash = await hashPassword("Admin@12345");
    admin = await prisma.user.create({
      data: {
        email: "admin@institution.edu",
        passwordHash: adminPasswordHash,
        firstName: "Super",
        lastName: "Administrator",
        role: Role.ADMIN,
        isActive: true,
      },
    });
    console.log(`Created admin: ${admin.email}`);
  } else {
    console.log(`Preserving existing admin: ${admin.email} (id: ${admin.id})`);
  }

  const adminId = admin.id;

  // 2. Perform deletion of non-admin data and dummy departments in a transaction
  console.log("Running transactional cleanup...");
  await prisma.$transaction(async (tx) => {
    // 2a. Unlink HOD references from all departments so User records can be deleted
    console.log("  - Unlinking HODs from all departments...");
    await tx.department.updateMany({
      data: { hodUserId: null },
    });

    // 2b. Delete approvals
    const delApprovals = await tx.approval.deleteMany({});
    console.log(`  - Deleted ${delApprovals.count} approval records`);

    // 2c. Delete fee verifications
    const delFeeVerifications = await tx.feeVerification.deleteMany({});
    console.log(`  - Deleted ${delFeeVerifications.count} fee verification records`);

    // 2d. Delete fees
    const delFees = await tx.fee.deleteMany({});
    console.log(`  - Deleted ${delFees.count} fee records`);

    // 2e. Delete subject-staff assignments
    const delSubjectStaff = await tx.subjectStaff.deleteMany({});
    console.log(`  - Deleted ${delSubjectStaff.count} subject-staff mappings`);

    // 2f. Delete staff profiles
    const delStaff = await tx.staff.deleteMany({});
    console.log(`  - Deleted ${delStaff.count} staff records`);

    // 2g. Delete student profiles
    const delStudents = await tx.student.deleteMany({});
    console.log(`  - Deleted ${delStudents.count} student records`);

    // 2h. Delete advisor profiles
    const delAdvisors = await tx.advisor.deleteMany({});
    console.log(`  - Deleted ${delAdvisors.count} advisor records`);

    // 2i. Delete subjects
    const delSubjects = await tx.subject.deleteMany({});
    console.log(`  - Deleted ${delSubjects.count} subject records`);

    // 2j. Delete classrooms
    const delClassrooms = await tx.classroom.deleteMany({});
    console.log(`  - Deleted ${delClassrooms.count} classroom records`);

    // 2k. Delete refresh tokens for non-admin users
    const delTokens = await tx.refreshToken.deleteMany({
      where: { userId: { not: adminId } },
    });
    console.log(`  - Deleted ${delTokens.count} non-admin refresh tokens`);

    // 2l. Delete all non-admin users
    const delUsers = await tx.user.deleteMany({
      where: { id: { not: adminId } },
    });
    console.log(`  - Deleted ${delUsers.count} non-admin users`);

    // 2m. Clean audit logs referencing non-admin actors or dummy departments
    const dummyDepts = await tx.department.findMany({
      where: { code: { notIn: OFFICIAL_CODES } },
      select: { id: true, code: true },
    });
    const dummyDeptIds = dummyDepts.map((d) => d.id);

    if (dummyDeptIds.length > 0) {
      await tx.auditLog.deleteMany({
        where: { departmentId: { in: dummyDeptIds } },
      });
    }

    await tx.auditLog.updateMany({
      where: { actorUserId: { not: adminId } },
      data: { actorUserId: null },
    });
    console.log("  - Cleaned audit logs");

    // 2n. Delete dummy departments
    const delDepts = await tx.department.deleteMany({
      where: { code: { notIn: OFFICIAL_CODES } },
    });
    console.log(`  - Deleted ${delDepts.count} dummy departments (${dummyDepts.map((d) => d.code).join(", ")})`);

    // 2o. Upsert the 11 official departments with standard names and null hod
    console.log("  - Standardizing the 11 official departments...");
    for (const dept of OFFICIAL_DEPARTMENTS) {
      await tx.department.upsert({
        where: { code: dept.code },
        update: {
          name: dept.name,
          hodUserId: null,
        },
        create: {
          code: dept.code,
          name: dept.name,
          hodUserId: null,
        },
      });
    }
  });

  // 3. Clear Redis cache for departments & dashboard
  try {
    const { cacheService } = await import("../src/plugins/redis");
    await cacheService.del("cache:admin:departments");
    await cacheService.del("cache:admin:dashboard");
    await cacheService.del("cache:departments:list");
    console.log("  - Cleared Redis cache (admin departments, dashboard, and public list)");
  } catch (err) {
    console.warn("  - Note: Redis cache flush skipped or Redis not reachable:", err);
  }

  console.log("=== CLEANUP COMPLETED SUCCESSFULLY ===");
}

main()
  .catch((e) => {
    console.error("Cleanup error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
