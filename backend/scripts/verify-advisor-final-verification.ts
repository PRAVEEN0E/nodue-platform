/* Advisor Final Verification regression. The completed (either subject,
   advisor, HOD and fee) state is engine-owned Student.isVerified — there is
   NO manual final-verification action. The new read-only endpoint
   GET /advisor/final-verification must list only the authenticated advisor's
   own classroom and only students whose derived state is complete.

   Scenario (matches the Final Verification spec):
     Dept AIML, IV-AIML -> Advisor 01, III-AIML -> Advisor 02.
       Student A  complete      (IV-AIML)
       Student B  complete      (III-AIML)
       Student C  incomplete (one subject still pending, IV-AIML)
       Student E  complete      (IV-AIML)   [pagination/edge]
       Student F  fee-not-verified (IV-AIML) [edge: must NOT show]

   Complete students are bootstrapped with engine-consistent rows and then
   finalized by calling the approval engine's tryFinalizeTx so isVerified is
   set through the real derivation path.

   Run:
     npx tsx scripts/verify-advisor-final-verification.ts
   Exits non-zero on any failure. Cleans up all bootstrap rows afterwards. */
import { PrismaClient, Role, ApprovalStatus } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { approvalEngine } from "../src/modules/approval-engine/approval-engine.service";

const BASE = process.env.ADVISOR_API_URL || "http://localhost:5000/api/v1";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function expect(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ""}`);
  }
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/access_token=([^;]+)/);
  if (!m) throw new Error(`no access_token for ${email}`);
  return m[1];
}

async function api(
  token: string | null,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const DOMAIN = `fv-${Date.now()}.verify.local`;
const email = (n: string) => `${n}@${DOMAIN}`;

const DEPT_CODE = `FVML-${Date.now().toString(36).slice(-4)}`;

const classrooms: string[] = [];
const userIds: string[] = [];

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.subjectStaff.deleteMany({
      where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { classroomId: { in: classrooms } } }] },
    });
    await prisma.approval.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.feeVerification.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subject.deleteMany({ where: { classroomId: { in: classrooms } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { id: { in: classrooms } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.department.deleteMany({ where: { code: DEPT_CODE } });
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");

  const dept = await prisma.department.create({
    data: { code: DEPT_CODE, name: "AIML Final-Verification Verify" },
  });
  const deptId = dept.id;

  const classroomIV = await prisma.classroom.create({
    data: { name: "IV-AIML (fv)", batch: "2022-2026", semester: 7, section: "A", departmentId: deptId },
  });
  const classroomIII = await prisma.classroom.create({
    data: { name: "III-AIML (fv)", batch: "2023-2027", semester: 5, section: "A", departmentId: deptId },
  });
  classrooms.push(classroomIV.id, classroomIII.id);

  const mkUser = (role: Role, firstName: string, lastName: string, key: string) =>
    prisma.user.create({
      data: { firstName, lastName, email: email(key), passwordHash, role, departmentId: deptId },
    });

  const a1User = await mkUser(Role.ADVISOR, "Advisor", "One", "advisor-one");
  const a2User = await mkUser(Role.ADVISOR, "Advisor", "Two", "advisor-two");
  const hodUser = await mkUser(Role.HOD, "Head", "Dept", "hod");
  const staffUser = await mkUser(Role.STAFF, "Staff", "One", "staff-one");
  userIds.push(a1User.id, a2User.id, hodUser.id, staffUser.id);

  await prisma.advisor.create({ data: { userId: a1User.id, classroomId: classroomIV.id } });
  await prisma.advisor.create({ data: { userId: a2User.id, classroomId: classroomIII.id } });
  await prisma.staff.create({
    data: { userId: staffUser.id, employeeCode: "FV-EMP", departmentId: deptId, designation: "Lecturer" },
  });

  // One subject per classroom (subjects must exist for staff approval checks)
  const subjIV = await prisma.subject.create({
    data: { code: `FV-S1-${Date.now().toString(36)}`, name: "Final Verify Subject IV", credits: 4, semester: 7, departmentId: deptId, classroomId: classroomIV.id },
  });
  const subjIII = await prisma.subject.create({
    data: { code: `FV-S2-${Date.now().toString(36)}`, name: "Final Verify Subject III", credits: 3, semester: 5, departmentId: deptId, classroomId: classroomIII.id },
  });

  interface StudentSeed {
    key: string;
    registerNumber: string;
    classroomId: string;
    subjectId: string;
    staffApproved: boolean;
    feeApproved: boolean;
    advocate: string;
  }

  const seeds: StudentSeed[] = [
    { key: "student-a", registerNumber: "FVREG-A01", classroomId: classroomIV.id, subjectId: subjIV.id, staffApproved: true, feeApproved: true, advocate: a1User.id },
    { key: "student-b", registerNumber: "FVREG-B01", classroomId: classroomIII.id, subjectId: subjIII.id, staffApproved: true, feeApproved: true, advocate: a2User.id },
    { key: "student-c", registerNumber: "FVREG-C01", classroomId: classroomIV.id, subjectId: subjIV.id, staffApproved: false, feeApproved: true, advocate: a1User.id },
    { key: "student-e", registerNumber: "FVREG-E01", classroomId: classroomIV.id, subjectId: subjIV.id, staffApproved: true, feeApproved: true, advocate: a1User.id },
    { key: "student-f", registerNumber: "FVREG-F01", classroomId: classroomIV.id, subjectId: subjIV.id, staffApproved: true, feeApproved: false, advocate: a1User.id },
  ];

const studentIds: Record<string, string> = {};
const registers: Record<string, string> = {};
const TAG = Date.now().toString(36);
for (const s of seeds) {
  const reg = `${s.registerNumber}-${TAG}`;
  registers[s.key] = reg;
  const su = await mkUser(Role.STUDENT, "Student", s.key.replace("student-", "").toUpperCase(), s.key);
  const st = await prisma.student.create({
    data: {
      userId: su.id,
      registerNumber: reg,
      rollNumber: reg,
      classroomId: s.classroomId,
      departmentId: deptId,
      admissionYear: 2022,
    },
  });
    studentIds[s.key] = st.id;

    await prisma.approval.create({
      data: { studentId: st.id, approverRole: Role.ADVISOR, approverUserId: a1User.id, subjectId: null, status: ApprovalStatus.APPROVED },
    });
    await prisma.approval.create({
      data: { studentId: st.id, approverRole: Role.HOD, approverUserId: hodUser.id, subjectId: null, status: ApprovalStatus.APPROVED },
    });
    if (s.staffApproved) {
      const staffOwner = s.classroomId === classroomIV.id ? a1User.id : a2User.id;
      await prisma.approval.create({
        data: { studentId: st.id, approverRole: Role.STAFF, approverUserId: staffUser.id, subjectId: s.subjectId, status: ApprovalStatus.APPROVED },
      });
    }
    await prisma.feeVerification.create({
      data: { studentId: st.id, advisorApproved: s.feeApproved, hodApproved: false, advisorById: s.feeApproved ? s.advocate : null },
    });

    // Drive isVerified through the real engine derivation path (monotonic).
    const finalized = await approvalEngine.tryFinalizeTx(prisma, st.id, s.advocate, deptId);
    if (!finalized) {
      const db = await prisma.student.findUniqueOrThrow({ where: { id: st.id }, select: { isVerified: true } });
      expect(db.isVerified === false, `engine left ${s.key} unverified (expected incomplete)`, db.isVerified);
    }
  }

  const tok1 = await login(email("advisor-one"), "Verify@12345");
  const tok2 = await login(email("advisor-two"), "Verify@12345");

  const ids = (r: any) => (r.json.data as Array<{ id: string }>).map((s) => s.id);

  // ─── 1. List scoping ──────────────────────────────────────────────────────
  console.log("1. Final Verification list scoping");
  let r = await api(tok1, "GET", "/advisor/final-verification");
  const l1 = ids(r);
  expect(r.status === 200 && l1.includes(studentIds["student-a"]), "Advisor 01 sees complete Student A", l1);
  expect(!l1.includes(studentIds["student-b"]), "Advisor 01 does NOT see Student B (III-AIML)", l1);
  expect(!l1.includes(studentIds["student-c"]), "Advisor 01 does NOT see incomplete Student C", l1);
  expect(!l1.includes(studentIds["student-f"]), "Advisor 01 does NOT see fee-not-verified Student F", l1);
  expect((r as any).json.meta.total === 2, "Advisor 01 total == 2 (A + E)", (r as any).json.meta.total);

  r = await api(tok2, "GET", "/advisor/final-verification");
  const l2 = ids(r);
  expect(r.status === 200 && l2.includes(studentIds["student-b"]), "Advisor 02 sees complete Student B", l2);
  expect(!l2.includes(studentIds["student-a"]), "Advisor 02 does NOT see Student A (IV-AIML)", l2);
  expect((r as any).json.meta.total === 1, "Advisor 02 total == 1", (r as any).json.meta.total);

  // ─── 2. Cross-classroom search is a no-op, never a leak ───────────────────
  console.log("2. Final Verification search scoping");
  r = await api(tok1, "GET", "/advisor/final-verification?search=Student%20B");
  expect((r as any).json.meta.total === 0, "Advisor 01 search 'Student B' -> 0", (r as any).json.meta.total);
  r = await api(tok2, "GET", "/advisor/final-verification?search=Student%20A");
  expect((r as any).json.meta.total === 0, "Advisor 02 search 'Student A' -> 0", (r as any).json.meta.total);
  r = await api(tok2, "GET", `/advisor/final-verification?search=${encodeURIComponent(email("student-a"))}`);
  expect((r as any).json.meta.total === 0, "Advisor 02 search by foreign email -> 0", (r as any).json.meta.total);
  r = await api(tok2, "GET", `/advisor/final-verification?search=${encodeURIComponent(registers["student-a"])}`);
  expect((r as any).json.meta.total === 0, "Advisor 02 search by foreign register -> 0", (r as any).json.meta.total);
  r = await api(tok1, "GET", `/advisor/final-verification?search=${encodeURIComponent(registers["student-a"])}`);
  expect((r as any).json.meta.total === 1, "Advisor 01 search own register -> 1", (r as any).json.meta.total);
  r = await api(tok1, "GET", "/advisor/final-verification?search=LoremIpsumNope");
  expect((r as any).json.meta.total === 0, "Advisor 01 garbage search -> 0", (r as any).json.meta.total);

  // ─── 3. Pagination (scope + search applied before page slicing) ───────────
  console.log("3. Pagination");
  r = await api(tok1, "GET", "/advisor/final-verification?page=1&limit=1");
  expect((r as any).json.data.length === 1 && (r as any).json.meta.totalPages === 2, "page 1 / limit 1 -> 1 row, 2 pages", (r as any).json.meta);
  r = await api(tok1, "GET", "/advisor/final-verification?page=2&limit=1");
  expect((r as any).json.data.length === 1, "page 2 / limit 1 -> 1 row", (r as any).json.data.length);
  r = await api(tok1, "GET", "/advisor/final-verification?page=2&limit=1&search=Student%20A");
  expect((r as any).json.data.length === 0, "search filtered before pagination (empty page)", (r as any).json.data);

  // ─── 4. No client-supplied scope ever widens the result ──────────────────
  console.log("4. Manipulated scope params are ignored / validated");
  r = await api(tok1, "GET", `/advisor/final-verification?classroomId=${classroomIII.id}`);
  expect((r as any).json.meta.total === 2, "classroomId param ignored (still own scope)", (r as any).json.meta.total);
  r = await api(tok1, "GET", `/advisor/final-verification?advisorId=${a2User.id}`);
  expect((r as any).json.meta.total === 2, "advisorId param ignored", (r as any).json.meta.total);
  r = await api(tok1, "GET", "/advisor/final-verification?limit=1000");
  expect(r.status === 400, "out-of-range limit -> 400", r.status);
  r = await api(tok1, "GET", "/advisor/final-verification?isVerified=false");
  expect((r as any).json.meta.total === 2, "isVerified tampering ignored (only derived true rows)", (r as any).json.meta.total);

  // ─── 5. No manual final-verification action or direct ID route ────────────
  console.log("5. Read-only: no manual action, no detail route");
  r = await api(tok1, "GET", `/advisor/final-verification/${studentIds["student-c"]}`);
  expect(r.status === 404, "GET detail by student ID -> 404 (no such route)", r.status);
  r = await api(tok1, "POST", "/advisor/final-verification", { studentId: studentIds["student-c"] });
  expect(r.status === 404, "POST manual finalize -> 404 (auto-derived, no manual action)", r.status);
  r = await api(tok1, "PATCH", `/advisor/final-verification/${studentIds["student-c"]}`, { verified: true });
  expect(r.status === 404, "PATCH manual finalize -> 404 (auto-derived, no manual action)", r.status);
  r = await api(tok1, "DELETE", `/advisor/final-verification/${studentIds["student-c"]}`);
  expect(r.status === 404, "DELETE -> 404", r.status);

  // ─── 6. Derived state integrity (engine-owned, no shadow status) ──────────
  console.log("6. Derived state integrity");
  const dbA = await prisma.student.findUniqueOrThrow({ where: { id: studentIds["student-a"] }, select: { isVerified: true, verifiedAt: true } });
  expect(dbA.isVerified === true && dbA.verifiedAt !== null, "Student A isVerified true with verifiedAt", dbA);
  const dbC = await prisma.student.findUniqueOrThrow({ where: { id: studentIds["student-c"] }, select: { isVerified: true } });
  expect(dbC.isVerified === false, "Student C isVerified false (one subject pending)", dbC);
  const dbF = await prisma.student.findUniqueOrThrow({ where: { id: studentIds["student-f"] }, select: { isVerified: true } });
  expect(dbF.isVerified === false, "Student F isVerified false (fee not verified)", dbF);

  // ─── 7. Role guard ────────────────────────────────────────────────────────
  console.log("7. Role guard");
  r = await api(null, "GET", "/advisor/final-verification");
  expect(r.status === 401, "unauthenticated -> 401", r.status);
  const hodTok = await login(email("hod"), "Verify@12345");
  const staffTok = await login(email("staff-one"), "Verify@12345");
  r = await api(hodTok, "GET", "/advisor/final-verification");
  expect(r.status === 403, "HOD cannot access advisor endpoint -> 403", r.status);
  r = await api(staffTok, "GET", "/advisor/final-verification");
  expect(r.status === 403, "STAFF cannot access advisor endpoint -> 403", r.status);

  // ─── 8. Classroom transfer: visibility follows current classroom ──────────
  console.log("8. Classroom transfer follows current classroom");
  await prisma.student.update({
    where: { id: studentIds["student-b"] },
    data: { classroomId: classroomIV.id, departmentId: deptId },
  });
  r = await api(tok2, "GET", "/advisor/final-verification");
  expect((r as any).json.meta.total === 0, "Advisor 02 no longer sees transferred Student B", (r as any).json.meta.total);
  r = await api(tok1, "GET", "/advisor/final-verification");
  const l1b = ids(r);
  expect((r as any).json.meta.total === 3 && l1b.includes(studentIds["student-b"]), "Advisor 01 now sees B (A + E + B)", l1b);
  expect(!l1b.includes(studentIds["student-c"]), "incomplete Student C still hidden after transfer", l1b);

  await cleanup();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  try {
    await cleanup();
  } catch {
    /* best effort */
  }
  await prisma.$disconnect();
  process.exit(1);
});