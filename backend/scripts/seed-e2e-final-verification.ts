/* E2E seed for Advisor Final Verification. Creates the spec scenario with
   fixed logins so browser tests can assert against it:
     Dept E2E-FV, IV-AIML (FV) -> a1@e2e-fv.verify.local
                   III-AIML (FV) -> a2@e2e-fv.verify.local
       sa -> Student A, complete (IV-AIML)
       sb -> Student B, complete (III-AIML)
       sc -> Student C, one subject pending (IV-AIML, incomplete)
   isVerified is set by the real approval engine (tryFinalizeTx).
   Idempotent: clears prior rows with the @e2e-fv.verify.local domain.

   Run: npx tsx scripts/seed-e2e-final-verification.ts */
import { PrismaClient, Role, ApprovalStatus } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { approvalEngine } from "../src/modules/approval-engine/approval-engine.service";

const prisma = new PrismaClient();
const DOMAIN = "e2e-fv.verify.local";
const DEPT_CODE = "E2E-FV";
const PASS = "Advisor@12345";

async function main() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    const classrooms = await prisma.classroom.findMany({ where: { department: { code: DEPT_CODE } }, select: { id: true } });
    const cids = classrooms.map((c) => c.id);
    await prisma.subjectStaff.deleteMany({ where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { classroomId: { in: cids } } }] } });
    await prisma.approval.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.feeVerification.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.subject.deleteMany({ where: { classroomId: { in: cids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { id: { in: cids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleaned ${ids.length} prior e2e-fv users`);
  }
  await prisma.department.deleteMany({ where: { code: DEPT_CODE } });

  const passwordHash = await hashPassword(PASS);
  const dept = await prisma.department.create({ data: { code: DEPT_CODE, name: "AIML Final Verification E2E" } });
  const deptId = dept.id;

  const mkUser = (role: Role, firstName: string, lastName: string, emailLocal: string) =>
    prisma.user.create({
      data: { firstName, lastName, email: `${emailLocal}@${DOMAIN}`, passwordHash, role, departmentId: deptId },
    });

  const a1User = await mkUser(Role.ADVISOR, "Advisor", "One", "a1");
  const a2User = await mkUser(Role.ADVISOR, "Advisor", "Two", "a2");
  const hodUser = await mkUser(Role.HOD, "E2E", "Hod", "hod-fv");
  const staffUser = await mkUser(Role.STAFF, "E2E", "Staff", "staff-fv");

  await prisma.advisor.create({ data: { userId: a1User.id, classroomId: (await prisma.classroom.create({ data: { name: "IV-AIML (FV)", batch: "2022-2026", semester: 7, section: "A", departmentId: deptId } })).id } });
  await prisma.advisor.create({ data: { userId: a2User.id, classroomId: (await prisma.classroom.create({ data: { name: "III-AIML (FV)", batch: "2023-2027", semester: 5, section: "A", departmentId: deptId } })).id } });
  await prisma.staff.create({ data: { userId: staffUser.id, employeeCode: "E2EFV-EMP", departmentId: deptId, designation: "Lecturer" } });

  const adv = (await prisma.advisor.findMany({ where: { userId: { in: [a1User.id, a2User.id] } }, select: { userId: true, classroomId: true } }));
  const classIVId = adv.find((a) => a.userId === a1User.id)!.classroomId;
  const classIIIId = adv.find((a) => a.userId === a2User.id)!.classroomId;

  const subjIV = await prisma.subject.create({ data: { code: "E2EFV-SIV", name: "Final Verify Subject IV", credits: 4, semester: 7, departmentId: deptId, classroomId: classIVId } });
  const subjIII = await prisma.subject.create({ data: { code: "E2EFV-SIII", name: "Final Verify Subject III", credits: 3, semester: 5, departmentId: deptId, classroomId: classIIIId } });

  async function seedStudent(key: string, reg: string, classId: string, subjectId: string, staffApproved: boolean, advocate: string, studentIdForName: string) {
    const su = await mkUser(Role.STUDENT, "Student", key, studentIdForName);
    const st = await prisma.student.create({ data: { userId: su.id, registerNumber: reg, rollNumber: reg, classroomId: classId, departmentId: deptId, admissionYear: 2022 } });
    await prisma.approval.create({ data: { studentId: st.id, approverRole: Role.ADVISOR, approverUserId: a1User.id, subjectId: null, status: ApprovalStatus.APPROVED } });
    await prisma.approval.create({ data: { studentId: st.id, approverRole: Role.HOD, approverUserId: hodUser.id, subjectId: null, status: ApprovalStatus.APPROVED } });
    if (staffApproved) {
      await prisma.approval.create({ data: { studentId: st.id, approverRole: Role.STAFF, approverUserId: staffUser.id, subjectId, status: ApprovalStatus.APPROVED } });
    }
    await prisma.feeVerification.create({ data: { studentId: st.id, advisorApproved: true, hodApproved: false, advisorById: advocate } });
    return approvalEngine.tryFinalizeTx(prisma, st.id, advocate, deptId);
  }

  const aFinal = await seedStudent("A", "FVREG-A01", classIVId, subjIV.id, true, a1User.id, "sa");
  const bFinal = await seedStudent("B", "FVREG-B01", classIIIId, subjIII.id, true, a2User.id, "sb");
  const cFinal = await seedStudent("C", "FVREG-C01", classIVId, subjIV.id, false, a1User.id, "sc");

  console.log(JSON.stringify({ aFinal, bFinal, cFinal, classIVId, classIIIId, advisors: [`a1@${DOMAIN}`, `a2@${DOMAIN}`] }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await prisma.$disconnect();
  process.exit(1);
});