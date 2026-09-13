/* Idempotent E2E seed for the Cross-Department Staff flow.

   Scenario (project §32/§34 final test data):
     Staff 01 (home dept XD-AIML) → IV-AIML {AI} + IV-IT {DS} + III-CSE {Python}
     Staff 02 (home dept XD-CSE, currently unassigned) → available college-wide

   Staff 01 must see classrooms grouped by department (AIML / CSE / IT) with an
   "All Departments" filter, and staff-preserved home dept XD-AIML everywhere.

   Usage (backend dir):
     npx tsx scripts/bootstrap-cross-department-e2e.ts
   Safe to re-run: cleans up prior bootstrap rows, then re-seeds. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const DOMAIN = "xdept.verify.local";
const PASS_STAFF = "Staff@12345";
const PASS_ADV = "Verify@12345";

const prisma = new PrismaClient();

async function main() {
  const staffHash = await hashPassword(PASS_STAFF);
  const advHash = await hashPassword(PASS_ADV);

  // ─── Cleanup (idempotent) ────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const prevDepts = await prisma.department.findMany({
    where: { code: { in: ["XD-AIML", "XD-IT", "XD-CSE"] } },
    select: { id: true },
  });
  const prevClassrooms = await prisma.classroom.findMany({
    where: { departmentId: { in: prevDepts.map((d) => d.id) } },
    select: { id: true },
  });
  const prevSubs = await prisma.subject.findMany({
    where: { classroomId: { in: prevClassrooms.map((c) => c.id) } },
    select: { id: true },
  });
  const classIds = prevClassrooms.map((c) => c.id);
  const subIds = prevSubs.map((s) => s.id);
  if (ids.length > 0 || classIds.length > 0 || subIds.length > 0) {
    await prisma.subjectStaff.deleteMany({
      where: {
        OR: [
          { staff: { userId: { in: ids } } },
          { subjectId: { in: subIds } },
        ],
      },
    });
    await prisma.approval.deleteMany({
      where: {
        OR: [
          { student: { userId: { in: ids } } },
          { subjectId: { in: subIds } },
        ],
      },
    });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.feeVerification.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subject.deleteMany({ where: { id: { in: subIds } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { id: { in: classIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.department.deleteMany({ where: { code: { in: ["XD-AIML", "XD-IT", "XD-CSE"] } } });
    console.log("  cleanup done");
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────
  const aiml = await prisma.department.create({ data: { code: "XD-AIML", name: "AI & ML" } });
  const it = await prisma.department.create({ data: { code: "XD-IT", name: "Information Technology" } });
  const cse = await prisma.department.create({ data: { code: "XD-CSE", name: "Computer Science" } });

  const ivAiml = await prisma.classroom.create({
    data: { name: "IV-AIML", batch: "2022-2026", semester: 7, section: "A", departmentId: aiml.id },
  });
  const ivIt = await prisma.classroom.create({
    data: { name: "IV-IT", batch: "2022-2026", semester: 7, section: "A", departmentId: it.id },
  });
  const iiiCse = await prisma.classroom.create({
    data: { name: "III-CSE", batch: "2023-2027", semester: 5, section: "A", departmentId: cse.id },
  });

  const mkUser = (firstName: string, lastName: string, key: string, role: Role, hash: string, departmentId: string) =>
    prisma.user.create({
      data: { firstName, lastName, email: `${key}@${DOMAIN}`, passwordHash: hash, role, departmentId },
    });

  // Advisors (one per department/classroom)
  const advAimlU = await mkUser("Ada", "AdvisorAIML", "xadv-aiml", Role.ADVISOR, advHash, aiml.id);
  const advItU = await mkUser("Ivan", "AdvisorIT", "xadv-it", Role.ADVISOR, advHash, it.id);
  const advCseU = await mkUser("Carl", "AdvisorCSE", "xadv-cse", Role.ADVISOR, advHash, cse.id);
  await prisma.advisor.create({ data: { userId: advAimlU.id, classroomId: ivAiml.id } });
  await prisma.advisor.create({ data: { userId: advItU.id, classroomId: ivIt.id } });
  await prisma.advisor.create({ data: { userId: advCseU.id, classroomId: iiiCse.id } });

  // Staff (home departments: staff01=AIML adopted-only-after-assignment, staff02=CSE unassigned)
  const st01U = await mkUser("Amit", "Cross", "xstaff01", Role.STAFF, staffHash, aiml.id);
  const st01 = await prisma.staff.create({
    data: { userId: st01U.id, employeeCode: "XDE2ES01", designation: "Associate Professor", departmentId: aiml.id },
  });
  const st02U = await mkUser("Bina", "Idle", "xstaff02", Role.STAFF, staffHash, cse.id);
  const st02 = await prisma.staff.create({
    data: { userId: st02U.id, employeeCode: "XDE2ES02", designation: "Assistant Professor", departmentId: cse.id },
  });

  // Subjects (one per classroom; a 2nd IT subject exercises cross-dept assign via UI)
  const mkSubject = async (code: string, name: string, semester: number, departmentId: string, classroomId: string) =>
    prisma.subject.create({
      data: { code, name, credits: 3, semester, departmentId, classroomId },
    });
  const aiAiml = await mkSubject("XDE2E-AI", "AI for IV-AIML", 7, aiml.id, ivAiml.id);
  const dsIt = await mkSubject("XDE2E-DS", "Data Science for IV-IT", 7, it.id, ivIt.id);
  const pyCse = await mkSubject("XDE2E-PY", "Python for III-CSE", 5, cse.id, iiiCse.id);
  const mlIt = await mkSubject("XDE2E-ML", "ML for IV-IT", 7, it.id, ivIt.id);

  // Mappings: staff01 teaches across all three departments
  const map = async (subjectId: string, staffId: string) =>
    prisma.subjectStaff.create({ data: { subjectId, staffId } });
  await map(aiAiml.id, st01.id);
  await map(dsIt.id, st01.id);
  await map(pyCse.id, st01.id);

  // Students (3 per classroom, so staff sees 3 students / 3 pending per class)
  const mkStudent = async (firstName: string, lastName: string, key: string, reg: string, classroomId: string, departmentId: string) => {
    const u = await mkUser(firstName, lastName, key, Role.STUDENT, advHash, departmentId);
    return prisma.student.create({
      data: { userId: u.id, registerNumber: reg, rollNumber: reg, classroomId, departmentId, admissionYear: key.startsWith("iii") ? 2023 : 2022 },
    });
  };
  await mkStudent("Aarav", "AIML", "xd-iv-a1", "XDPT-IVA-01", ivAiml.id, aiml.id);
  await mkStudent("Bhavya", "AIML", "xd-iv-a2", "XDPT-IVA-02", ivAiml.id, aiml.id);
  await mkStudent("Charan", "AIML", "xd-iv-a3", "XDPT-IVA-03", ivAiml.id, aiml.id);
  await mkStudent("Divya", "IT", "xd-iv-i1", "XDPT-IVI-01", ivIt.id, it.id);
  await mkStudent("Esha", "IT", "xd-iv-i2", "XDPT-IVI-02", ivIt.id, it.id);
  await mkStudent("Farhan", "IT", "xd-iv-i3", "XDPT-IVI-03", ivIt.id, it.id);
  await mkStudent("Gauri", "CSE", "xd-iii-c1", "XDPT-IIIC-01", iiiCse.id, cse.id);
  await mkStudent("Hari", "CSE", "xd-iii-c2", "XDPT-IIIC-02", iiiCse.id, cse.id);
  await mkStudent("Ishaan", "CSE", "xd-iii-c3", "XDPT-IIIC-03", iiiCse.id, cse.id);

  void st02;

  await prisma.$disconnect();

  console.log(`E2E cross-department seed ready (${DOMAIN}):`);
  console.log("  staff01 (home XD-AIML) -> AI[IV-AIML] DS[IV-IT] PY[III-CSE]");
  console.log("  staff02 (home XD-CSE)  -> unassigned, available college-wide");
  console.log("  login: xstaff01@xdept.verify.local / Staff@12345");
  console.log("  advisor: xadv-it@xdept.verify.local / Verify@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());