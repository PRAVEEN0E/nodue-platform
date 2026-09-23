import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

// ─── Demo / development seed ──────────────────────────────────────────────
// Non-admin dummy users and dummy departments have been removed from the project.
// This script now only verifies/upserts the system Admin user.

async function main() {
  console.log("Seeding Admin account...");

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@institution.edu" },
    update: {
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      email: "admin@institution.edu",
      passwordHash: await hashPassword("Admin@12345"),
      firstName: "Super",
      lastName: "Administrator",
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`  Admin user: ${adminUser.email} [${adminUser.role}]`);
  console.log("Demo seed completed (no dummy users or dummy departments created).");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
