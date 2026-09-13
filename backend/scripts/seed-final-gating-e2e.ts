/* E2E seed for Final Verification gating (§25/§26 of the spec). Fixed logins,
   idempotent (clears @e2e-fg.verify.local + E2E-FG first). Scenario:

     Dept E2E-FG, classroom IV-AIML (FG) -> advisor ag@e2e-fg.verify.local
     hod hg@e2e-fg.verify.local, staff sg@e2e-fg.verify.local (mapped to all 3 subjects)
        g1 -> "Gate One"   1/3 subjects approved, advisor+hod+fee done,
                            STALE isVerified=true (impossible state the bug
                            relies on: read paths must NOT surface it).
        g2 -> "Gate Two"   3/3 subjects, advisor+hod+fee done, engine-finalized
                            (legit COMPLETE; fee via advisor).
        g3 -> "Gate Three" 3/3 subjects, advisor+hod done, fee via HOD ONLY
                            (§24 OR rule) -> COMPLETE.
        g4 -> "Gate Four"  1/3 subjects, nothing else -> early pipeline.

   Run: npx tsx scripts/seed-final-gating-e2e.ts */
import { PrismaClient, Role, ApprovalStatus } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { approvalEngine } from "../src/modules/approval-engine/approval-engine.service";

const prisma = new PrismaClient();
const DOMAIN = "e2e-fg.verify.local";
const DEPT_CODE = "E2E-FG";
const PASS = "Advisor@12345";

async function main() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    const dept = await prisma.department.findUnique({ where: { code: DEPT_CODE }, select: { id: true } });
    const dId = dept?.id ?? "";
    const classrooms = dId ? await prisma.classroom.findMany({ where: { departmentId: dId }, select: { id: true } }) : [];
    const cids = classrooms.map((c) => c.id);
    await prisma.subjectStaff.deleteMany({ where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { classroomId: { in: cids } } }] } });
    await prisma.approval.deleteMany({ where: { OR: [{ student: { userId: { in: ids } } }, { subject: { classroomId: { in: cids } } }] } });
    await prisma.feeVerification.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.subject.deleteMany({ where: { classroomId: { in: cids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { id: { in: cids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleaned ${ids.length} prior e2e-fg users`);
  }
  await prisma.department.deleteMany({ where: { code: DEPT_CODE } });

  const passwordHash = await hashPassword(PASS);
  const dept = await prisma.department.create({ data: { code: DEPT_CODE, name: "Final Gating E2E" } });
  const deptId = dept.id;

  const mkUser = (role: Role, first: string, last: string, local: string) =>
    prisma.user.create({
      data: { firstName: first, lastName: last, email: `${local}@${DOMAIN}`, passwordHash, role, departmentId: deptId },
    });

  const agUser = await mkUser(Role.ADVISOR, "Advisor", "Gate", "ag");
  await mkUser(Role.HOD, "HOD", "Gate", "hg");
  const staffUser = await mkUser(Role.STAFF, "Staff", "Gate", "sg");
  const classroom = await prisma.classroom.create({ data: { name: "IV-AIML (FG)", batch: "2022-2026", semester: 7, section: "A", departmentId: deptId } });
  const classroomId = classroom.id;
  await prisma.advisor.create({ data: { userId: agUser.id, classroomId } });
  const staff = await prisma.staff.create({
    data: { userId: staffUser.id, employeeCode: "E2EFG-EMP", departmentId: deptId, designation: "Lecturer", classroomId },
  });

  const subjects: string[] = [];
  for (const code of ["E2EFG-S1", "E2EFG-S2", "E2EFG-S3"]) {
    const s = await prisma.subject.create({
      data: { code, name: `Gating Subject ${code}`, credits: 3, semester: 7, departmentId: deptId, classroomId },
    });
    subjects.push(s.id);
    await prisma.subjectStaff.create({ data: { subjectId: s.id, staffId: staff.id } });
  }

  async function seedStudent(key: string, first: string, last: string, approved: number[], feeAdvisor: boolean, feeHod: boolean, finalize: boolean, staleVerified: boolean): Promise<string> {
    const su = await mkUser(Role.STUDENT, first, last, key);
    const st = await prisma.student.create({
      data: { userId: su.id, registerNumber: `FG-${first.replace(/\s/g, "").toUpperCase()}-${Date.now().toString(36)}`, rollNumber: `FG-R-${key}`, classroomId, departmentId: deptId, admissionYear: 2022 },
    });
    await prisma.approval.create({ data: { studentId: st.id, approverRole: Role.ADVISOR, approverUserId: agUser.id, subjectId: null, status: ApprovalStatus.APPROVED } });
    await prisma.approval.create({ data: { studentId: st.id, approverRole: Role.HOD, approverUserId: (await prisma.user.findUniqueOrThrow({ where: { email: `hg@${DOMAIN}` } })).id, subjectId: null, status: ApprovalStatus.APPROVED } });
    for (const idx of approved) {
      await prisma.approval.create({ data: { studentId: st.id, approverRole: Role.STAFF, approverUserId: staffUser.id, subjectId: subjects[idx], status: ApprovalStatus.APPROVED } });
    }
    await prisma.feeVerification.create({
      data: { studentId: st.id, advisorApproved: feeAdvisor, hodApproved: feeHod, advisorById: feeAdvisor ? agUser.id : null, hodById: feeHod ? (await prisma.user.findUniqueOrThrow({ where: { email: `hg@${DOMAIN}` } })).id : null },
    });
    if (finalize) {
      await approvalEngine.tryFinalizeTx(prisma, st.id, agUser.id, deptId);
    }
    if (staleVerified) {
      await prisma.student.update({ where: { id: st.id }, data: { isVerified: true, verifiedAt: new Date() } });
    }
    return st.id;
  }

  await seedStudent("g1", "Gate", "One", [0], true, false, false, true);
  await seedStudent("g2", "Gate", "Two", [0, 1, 2], true, false, true, false);
  await seedStudent("g3", "Gate", "Three", [0, 1, 2], false, true, true, false);
  await seedStudent("g4", "Gate", "Four", [0], false, false, false, false);

  console.log(JSON.stringify({ classroomId, students: { g1: "Gate One", g2: "Gate Two", g3: "Gate Three", g4: "Gate Four" } }));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await prisma.$disconnect();
  process.exit(1);
});