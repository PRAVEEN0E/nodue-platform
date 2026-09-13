/* Phase 4 verification: Advisor RBAC, classroom isolation, CRUD, mapping,
   fees, validation. Run against a live dev API:
     npx tsx scripts/verify-advisor-phase4.ts
   Exits non-zero on any failure. Cleans up all bootstrap rows afterwards. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

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
): Promise<{ status: number; json: unknown }> {
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

const TEST_DOMAIN = "phase4.verify.local";
const email = (n: string) => `${n}@${TEST_DOMAIN}`;

async function cleanup() {
  // "own student verified" expects a fresh (alreadyVerified:false) fee state;
  // prior runs leave the real seed student's fee verification approved.
  const ownReal = await prisma.student.findFirst({
    where: { classroom: { advisor: { user: { email: "advisor.cse@institution.edu" } } } },
    select: { id: true },
  });
  if (ownReal) {
    await prisma.feeVerification.deleteMany({ where: { studentId: ownReal.id } });
  }
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.subjectStaff.deleteMany({
      where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { code: { startsWith: "P4" } } }] },
    });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P4" } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { name: "P4 Isolation B" } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } else {
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P4" } } });
    await prisma.classroom.deleteMany({ where: { name: "P4 Isolation B" } });
  }
}

async function main() {
  await cleanup();

  // ─── Bootstrap ──────────────────────────────────────────────────────────
  const passwordHash = await hashPassword("Verify@12345");
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const ece = await prisma.department.findUniqueOrThrow({ where: { code: "ECE" } });

  // Classroom B in CSE + advisor B assigned to it
  const classroomB = await prisma.classroom.create({
    data: { name: "P4 Isolation B", batch: "2024-2028", semester: 2, section: "Z", departmentId: cse.id },
  });
  const advisorBUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "FourB", email: email("advisor-b"), passwordHash, role: Role.ADVISOR, departmentId: cse.id },
  });
  await prisma.advisor.create({ data: { userId: advisorBUser.id, classroomId: classroomB.id } });

  // Student + staff + subject + fee inside classroom B
  const studentBUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "PupilB", email: email("student-b"), passwordHash, role: Role.STUDENT, departmentId: cse.id },
  });
  const studentB = await prisma.student.create({
    data: { userId: studentBUser.id, registerNumber: "P4REGB001", classroomId: classroomB.id, departmentId: cse.id, admissionYear: 2024 },
  });
  const staffBUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "TutorB", email: email("staff-b"), passwordHash, role: Role.STAFF, departmentId: cse.id },
  });
  const staffB = await prisma.staff.create({
    data: { userId: staffBUser.id, employeeCode: "P4EMPB001", departmentId: cse.id, designation: "Lecturer" },
  });
  const subjectB = await prisma.subject.create({
    data: { code: "P4SUBJB", name: "Phase Four Subject B", credits: 3, semester: 2, departmentId: cse.id, classroomId: classroomB.id },
  });
  await prisma.fee.create({
    data: { studentId: studentB.id, title: "Tuition B", totalAmount: 50000, paidAmount: 0, status: "PENDING" },
  });

  // Cross-department staff (ECE) for mapping-scope test
  const staffCUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "TutorC", email: email("staff-c"), passwordHash, role: Role.STAFF, departmentId: ece.id },
  });
  const staffC = await prisma.staff.create({
    data: { userId: staffCUser.id, employeeCode: "P4EMPC001", departmentId: ece.id, designation: "Lecturer" },
  });

  // Role probes (no profiles needed: authorize() rejects before scope)
  for (const role of [Role.HOD, Role.STAFF, Role.STUDENT] as const) {
    await prisma.user.create({
      data: { firstName: "Probe", lastName: role, email: email(`probe-${role.toLowerCase()}`), passwordHash, role, departmentId: cse.id },
    });
  }

  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const advisorTok = await login("advisor.cse@institution.edu", "Advisor@12345");
  const hodTok = await login(email("probe-hod"), "Verify@12345");
  const staffTok = await login(email("probe-staff"), "Verify@12345");
  const studentTok = await login(email("probe-student"), "Verify@12345");

  // ─── 1. Role RBAC ───────────────────────────────────────────────────────
  console.log("1. Role RBAC");
  let r = await api(null, "GET", "/advisor/dashboard");
  expect(r.status === 401, "unauthenticated -> 401", r.status);
  r = await api(adminTok, "GET", "/advisor/dashboard");
  expect(r.status === 403, "ADMIN -> 403", r.status);
  r = await api(hodTok, "GET", "/advisor/dashboard");
  expect(r.status === 403, "HOD -> 403", r.status);
  r = await api(staffTok, "GET", "/advisor/dashboard");
  expect(r.status === 403, "STAFF -> 403", r.status);
  r = await api(studentTok, "GET", "/advisor/dashboard");
  expect(r.status === 403, "STUDENT -> 403", r.status);
  r = await api(advisorTok, "GET", "/advisor/dashboard");
  expect(r.status === 200, "ADVISOR -> 200", r.status);

  // ─── 2. Advisor students CRUD ───────────────────────────────────────────
  console.log("2. Students CRUD + validation");
  r = await api(advisorTok, "GET", "/advisor/students");
  expect(r.status === 200, "list students 200", r.status);

  r = await api(advisorTok, "POST", "/advisor/students", {
    firstName: "A",
    lastName: "Pupil",
    email: email("pupil-a"),
    password: "weak",
    registerNumber: "P4REGA001",
    admissionYear: 2024,
  });
  expect(r.status === 400, "invalid body -> 400", r.status);

  r = await api(advisorTok, "POST", "/advisor/students", {
    firstName: "Asha",
    lastName: "Pupil",
    email: email("pupil-a"),
    password: "Pupil@12345",
    registerNumber: "P4REGA001",
    admissionYear: 2024,
  });
  expect(r.status === 201, "create student -> 201", r.status);
  const studentAId = (r.json as { data: { id: string } }).data.id;

  r = await api(advisorTok, "POST", "/advisor/students", {
    firstName: "Asha",
    lastName: "Clone",
    email: email("pupil-a"),
    password: "Pupil@12345",
    registerNumber: "P4REGA002",
    admissionYear: 2024,
  });
  expect(r.status === 409, "duplicate email -> 409", r.status);

  r = await api(advisorTok, "GET", `/advisor/students/${studentAId}`);
  expect(r.status === 200, "get own student -> 200", r.status);

  r = await api(advisorTok, "PATCH", `/advisor/students/${studentAId}`, { isActive: false });
  expect(r.status === 200, "patch own student -> 200", r.status);

  r = await api(advisorTok, "PATCH", `/advisor/students/${studentAId}`, { isActive: true });
  expect(r.status === 200, "reactivate student -> 200", r.status);

  // ─── 3. Classroom isolation: students ───────────────────────────────────
  console.log("3. Isolation: students");
  r = await api(advisorTok, "GET", `/advisor/students/${studentB.id}`);
  expect(r.status === 403, "read other classroom student -> 403", r.status);
  r = await api(advisorTok, "PATCH", `/advisor/students/${studentB.id}`, { isActive: false });
  expect(r.status === 403, "patch other classroom student -> 403", r.status);
  r = await api(advisorTok, "GET", "/advisor/students/00000000-0000-4000-8000-000000000000");
  expect(r.status === 404, "missing student -> 404", r.status);
  r = await api(advisorTok, "GET", "/advisor/students/not-a-uuid");
  expect(r.status === 400, "malformed id -> 400", r.status);

  // ─── 4. Staff (assignment-only) + isolation ─────────────────────────────
  // Staff accounts are created by ADMIN only (unassigned department pool).
  // Advisors may list eligible available staff and read their own classroom's
  // assigned staff; create/edit operations are explicitly denied.
  console.log("4. Staff (assignment-only) + isolation");

  // Admin creates the account; it joins the CSE unassigned pool.
  r = await api(adminTok, "POST", "/admin/staff", {
    firstName: "Arun",
    lastName: "Tutor",
    email: email("tutor-a"),
    password: "Tutor@12345",
    employeeCode: "P4EMPA001",
    designation: "Assistant Professor",
    departmentId: cse.id,
  });
  expect(r.status === 201, "admin creates staff -> 201", r.status);
  const staffAId = (r.json as { data: { id: string } }).data.id;

  // Advisor attempts to create/edit staff accounts are always rejected.
  r = await api(advisorTok, "POST", "/advisor/staff", {
    firstName: "Arun",
    lastName: "Tutor",
    email: email("tutor-a"),
    password: "Tutor@12345",
    employeeCode: "P4EMPA002",
    designation: "Lecturer",
  });
  expect(r.status === 403, "advisor create staff -> 403", r.status);
  r = await api(advisorTok, "PATCH", `/advisor/staff/${staffAId}`, { designation: "Associate Professor" });
  expect(r.status === 403, "advisor patch staff -> 403", r.status);

  // The created staff appears in the advisor's available pool.
  r = await api(advisorTok, "GET", "/advisor/staff/available");
  expect(r.status === 200 && (r.json as { data: Array<{ id: string }> }).data.some((s) => s.id === staffAId), "available includes admin-created staff -> 200", r.status);

  // Not yet adopted: readable via the availability list but scoped reads 403.
  r = await api(advisorTok, "GET", `/advisor/staff/${staffAId}`);
  expect(r.status === 403, "read unassigned staff (not in own classroom) -> 403", r.status);
  r = await api(advisorTok, "GET", `/advisor/staff/${staffB.id}`);
  expect(r.status === 403, "read staff outside own classroom -> 403", r.status);
  r = await api(advisorTok, "GET", `/advisor/staff/${staffC.id}`);
  expect(r.status === 403, "read other-department staff -> 403", r.status);

  // Admin lifecycle: deactivation removes staff from the available pool.
  r = await api(adminTok, "PATCH", `/admin/staff/${staffAId}`, { isActive: false });
  expect(r.status === 200, "admin deactivates staff -> 200", r.status);
  r = await api(advisorTok, "GET", "/advisor/staff/available");
  expect(!(r.json as { data: Array<{ id: string }> }).data.some((s) => s.id === staffAId), "inactive staff excluded from available", r.status);
  r = await api(adminTok, "PATCH", `/admin/staff/${staffAId}`, { isActive: true });
  expect(r.status === 200, "admin reactivates staff -> 200", r.status);

  // ─── 5. Subjects + mapping ──────────────────────────────────────────────
  console.log("5. Subjects + mapping");
  r = await api(advisorTok, "POST", "/advisor/subjects", {
    code: "P4SUBJA",
    name: "Phase Four Subject A",
    credits: 4,
    semester: 7,
  });
  expect(r.status === 201, "create subject -> 201", r.status);
  const subjectA = await prisma.subject.findUniqueOrThrow({ where: { code: "P4SUBJA" } });

  r = await api(advisorTok, "POST", "/advisor/subjects", {
    code: "P4SUBJA",
    name: "Duplicate",
    credits: 3,
    semester: 7,
  });
  expect(r.status === 409, "duplicate subject code -> 409", r.status);

  r = await api(advisorTok, "GET", `/advisor/subjects/${subjectB.id}`);
  expect(r.status === 403, "read other classroom subject -> 403", r.status);

  r = await api(advisorTok, "POST", `/advisor/subjects/${subjectA.id}/staff`, { staffId: staffAId });
  expect(r.status === 201, "map own subject + dept staff -> 201", r.status);

  r = await api(advisorTok, "POST", `/advisor/subjects/${subjectA.id}/staff`, { staffId: staffAId });
  expect(r.status === 409, "duplicate mapping -> 409", r.status);

  // Mapping adopts the staff member into the advisor's classroom.
  r = await api(advisorTok, "GET", `/advisor/staff/${staffAId}`);
  expect(r.status === 200, "assigned staff readable after adoption -> 200", r.status);
  r = await api(advisorTok, "GET", "/advisor/staff");
  expect((r.json as { data: Array<{ id: string }> }).data.some((s) => s.id === staffAId), "assigned staff listed -> 200", r.status);

  r = await api(advisorTok, "POST", `/advisor/subjects/${subjectB.id}/staff`, { staffId: staffAId });
  expect(r.status === 403, "map other classroom subject -> 403", r.status);

  r = await api(advisorTok, "POST", `/advisor/subjects/${subjectA.id}/staff`, { staffId: staffC.id });
  expect(r.status === 201, "map other-department staff (staff college-wide) -> 201", r.status);

  r = await api(advisorTok, "DELETE", `/advisor/subjects/${subjectA.id}/staff/${staffAId}`);
  expect(r.status === 200, "unmap -> 200", r.status);

  r = await api(advisorTok, "DELETE", `/advisor/subjects/${subjectA.id}/staff/${staffAId}`);
  expect(r.status === 404, "unmap missing -> 404", r.status);

  // ─── 6. Fee verification (classroom-scoped, OR rule) ───────────────────
  console.log("6. Fee verification");
  r = await api(advisorTok, "GET", "/advisor/fees");
  expect(r.status === 200, "list fee verifications -> 200", r.status);
  const feeList = (r.json as { data: Array<{ studentId: string; verified: boolean }> }).data;
  expect(
    Array.isArray(feeList) && feeList.every((x) => "studentId" in x && "verified" in x && !("totalAmount" in x || "paidAmount" in x)),
    "verification shape only (no financial fields)",
    feeList.length
  );
  expect(!feeList.some((x) => x.studentId === studentB.id), "other classroom student not listed", feeList.length);

  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: studentB.id });
  expect(r.status === 403, "approve other classroom student -> 403", r.status);

  const ownStudent = await prisma.student.findFirstOrThrow({
    where: { classroom: { advisor: { user: { email: "advisor.cse@institution.edu" } } } },
  });
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: ownStudent.id });
  expect(r.status === 200, "approve own student -> 200", r.status);
  const approved = (r.json as { data: { verified: boolean; alreadyVerified: boolean } }).data;
  expect(approved.verified === true && approved.alreadyVerified === false, "own student verified after approve", approved);

  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: ownStudent.id });
  const again = (r.json as { data: { verified: boolean; alreadyVerified: boolean } }).data;
  expect(r.status === 200 && again.verified === true && again.alreadyVerified === true, "idempotent: second approve stays verified", again);

  // ─── 7. Dashboard shape ─────────────────────────────────────────────────
  console.log("7. Dashboard");
  r = await api(advisorTok, "GET", "/advisor/dashboard");
  const dash = (r.json as { data: Record<string, unknown> }).data;
  expect(
    r.status === 200 &&
      typeof (dash.counts as Record<string, unknown>).students === "number" &&
      typeof (dash.fees as Record<string, unknown>).pending === "number" &&
      Array.isArray(dash.recentActivity),
    "dashboard shape ok",
    r.status
  );

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
