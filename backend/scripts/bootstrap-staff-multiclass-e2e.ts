/* Idempotent E2E seed for the Staff Multi-Class / Multi-Subject flow.

   Scenario (project §29 final test data):
     Staff 01 → MC-E2E IV  {AI, ML} + MC-E2E III {AI, Data Science}
     Staff 02 → MC-E2E IV  {Data Science}

   Staff 01 must NOT see MC-E2E IV → Data Science anywhere.

   Usage (backend dir):
     npm run seed:mc-e2e   (or npx tsx scripts/bootstrap-staff-multiclass-e2e.ts)
   Safe to re-run: cleans up prior bootstrap rows, then re-seeds. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const DOMAIN = "mce2e.verify.local";
const DEPT = "MCE2E";
const PASS_STAFF = "Staff@12345";
const PASS_OTHER = "Verify@12345";

const prisma = new PrismaClient();

async function main() {
  const staffHash = await hashPassword(PASS_STAFF);
  const otherHash = await hashPassword(PASS_OTHER);

  // ─── Cleanup (idempotent) ────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const prevDept = await prisma.department.findUnique({ where: { code: DEPT } });
  const prevClassrooms = await prisma.classroom.findMany({
    where: { name: { in: ["MC-E2E IV", "MC-E2E III"] } },
    select: { id: true },
  });
  const classIds = prevClassrooms.map((c) => c.id);
  if (ids.length > 0 || classIds.length > 0) {
    await prisma.subjectStaff.deleteMany({
      where: {
        OR: [
          { staff: { userId: { in: ids } } },
          { subject: { classroomId: { in: classIds } } },
        ],
      },
    });
    await prisma.approval.deleteMany({
      where: {
        OR: [
          { student: { userId: { in: ids } } },
          { subject: { classroomId: { in: classIds } } },
        ],
      },
    });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.feeVerification.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subject.deleteMany({ where: { classroomId: { in: classIds } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { id: { in: classIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log("  cleanup done");
  }
  if (prevDept) {
    await prisma.department.delete({ where: { code: DEPT } });
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────
  const dept = await prisma.department.create({ data: { code: DEPT, name: "MC E2E Department" } });

  const iv = await prisma.classroom.create({
    data: { name: "MC-E2E IV", batch: "2022-2026", semester: 7, section: "A", departmentId: dept.id },
  });
  const iii = await prisma.classroom.create({
    data: { name: "MC-E2E III", batch: "2023-2027", semester: 5, section: "A", departmentId: dept.id },
  });

  const mkUser = (firstName: string, lastName: string, key: string, role: Role, hash: string) =>
    prisma.user.create({
      data: { firstName, lastName, email: `${key}@${DOMAIN}`, passwordHash: hash, role, departmentId: dept.id },
    });

  // Advisors
  const advIvU = await mkUser("Marc", "AdvisorIV", "advisor-mciv", Role.ADVISOR, otherHash);
  const advIiiU = await mkUser("Mia", "AdvisorIII", "advisor-mciii", Role.ADVISOR, otherHash);
  await prisma.advisor.create({ data: { userId: advIvU.id, classroomId: iv.id } });
  await prisma.advisor.create({ data: { userId: advIiiU.id, classroomId: iii.id } });

  // Staff
  const st01U = await mkUser("Staff", "OneMC", "staff-mc01", Role.STAFF, staffHash);
  const st01 = await prisma.staff.create({
    data: { userId: st01U.id, employeeCode: "MCE2ES01", designation: "Assistant Professor", departmentId: dept.id },
  });
  const st02U = await mkUser("Staff", "TwoMC", "staff-mc02", Role.STAFF, staffHash);
  const st02 = await prisma.staff.create({
    data: { userId: st02U.id, employeeCode: "MCE2ES02", designation: "Assistant Professor", departmentId: dept.id },
  });

  // Subjects (codes globally unique)
  const mkSubject = async (code: string, name: string, semester: number, classroomId: string) =>
    prisma.subject.create({
      data: { code, name, credits: 3, semester, departmentId: dept.id, classroomId },
    });
  const aiIv = await mkSubject("MCAI-E2E", "AI in IV-MC", 7, iv.id);
  const mlIv = await mkSubject("MCMLE2E", "Machine Learning in IV-MC", 7, iv.id);
  const dsIv = await mkSubject("MCDS-E2E", "Data Science in IV-MC", 7, iv.id);
  const aiIii = await mkSubject("MXAI-E2E", "AI in III-MC", 5, iii.id);
  const dsIii = await mkSubject("MXDS-E2E", "Data Science in III-MC", 5, iii.id);

  // Mappings (§29)
  const map = async (subjectId: string, staffId: string) =>
    prisma.subjectStaff.create({ data: { subjectId, staffId } });
  await map(aiIv.id, st01.id);
  await map(mlIv.id, st01.id);
  await map(dsIv.id, st02.id);
  await map(aiIii.id, st01.id);
  await map(dsIii.id, st01.id);

  // Students
  const mkStudent = async (firstName: string, lastName: string, key: string, reg: string, classroomId: string) => {
    const u = await mkUser(firstName, lastName, key, Role.STUDENT, otherHash);
    return prisma.student.create({
      data: { userId: u.id, registerNumber: reg, rollNumber: reg, classroomId, departmentId: dept.id, admissionYear: key.startsWith("iv") ? 2022 : 2023 },
    });
  };
  const s1 = await mkStudent("Aarav", "IVMC", "iv1", "MCE2E-IV001", iv.id);
  const s2 = await mkStudent("Bhavya", "IVMC", "iv2", "MCE2E-IV002", iv.id);
  const s3 = await mkStudent("Charan", "IVMC", "iv3", "MCE2E-IV003", iv.id);
  await mkStudent("Disha", "IIIMC", "iii1", "MCE2E-III001", iii.id);
  await mkStudent("Esha", "IIIMC", "iii2", "MCE2E-III002", iii.id);

  await prisma.$disconnect();

  console.log("E2E staff multi-class seed ready:");
  console.log(`  dept ${DEPT} :: IV ${iv.name} / III ${iii.name}`);
  console.log(`  staff-mc01 -> AI[IV] ML[IV] AI[III] DS[III]   (students ${s1.registerNumber}..${s3.registerNumber} + III)`);
  console.log(`  staff-mc02 -> DS[IV]`);
  console.log("  login: staff-mc01@mce2e.verify.local / Staff@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());