/* Cleanup helper for the Staff Responsibility UI E2E (demo domain).
   Removes staff accounts created through the /admin/staff UI during the
   staff_responsibility_e2e run (email domain @sr2e.verify.local), the subject
   mappings created when the advisor assigned them, and the run's leftover
   subjects meeting the run naming convention.
     npx tsx scripts/cleanup-staff-e2e.ts
   Safe to re-run. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DOMAIN = "@sr2e.verify.local";
const SUBJECT_PREFIX = "SR2E";

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.subjectStaff.deleteMany({ where: { staff: { userId: { in: ids } } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`staff-e2e cleanup: removed ${ids.length} user(s)`);
  }
  const subjects = await prisma.subject.deleteMany({ where: { code: { startsWith: SUBJECT_PREFIX } } });
  console.log(`staff-e2e cleanup: removed ${subjects.count} leftover run subject(s)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});