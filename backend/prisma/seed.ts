import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

// ─── Production / system seed ─────────────────────────────────────────────
// Seeds required system configuration:
// 1. The 11 official academic departments.
// 2. The system Administrator account (admin@institution.edu).
// Never creates dummy users or demo classrooms.

const DEPARTMENTS = [
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

async function main() {
  console.log("Seeding system configuration (11 official departments + Admin)...");

  // Upsert the 11 official departments
  for (const dept of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: {
        code: dept.code,
        name: dept.name,
      },
    });
    console.log(`  Department: ${record.code}`);
  }

  // Ensure any dummy departments not in the official list are cleaned up
  const officialCodes = DEPARTMENTS.map((d) => d.code);
  const dummyDepts = await prisma.department.deleteMany({
    where: { code: { notIn: officialCodes } },
  });
  if (dummyDepts.count > 0) {
    console.log(`  Cleaned up ${dummyDepts.count} non-official dummy departments.`);
  }

  // Ensure initial system administrator account exists
  const adminPasswordHash = await hashPassword("Admin@12345");
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@institution.edu" },
    update: {
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      email: "admin@institution.edu",
      passwordHash: adminPasswordHash,
      firstName: "Super",
      lastName: "Administrator",
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`  Admin user: ${adminUser.email} [${adminUser.role}]`);

  // Invalidate Redis department/dashboard caches so fresh data is served immediately
  try {
    const { cacheService } = await import("../src/plugins/redis");
    await cacheService.del("cache:admin:departments");
    await cacheService.del("cache:admin:dashboard");
    await cacheService.del("cache:departments:list");
    console.log("  Redis department caches invalidated.");
  } catch {
    // Redis optional during standalone migrations
  }

  console.log("System seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
