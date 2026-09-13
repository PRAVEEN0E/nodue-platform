/* Phase 5 verification: Staff RBAC, assignment isolation, approvals,
   idempotency, concurrency, validation, audit. Run against live dev API:
     npx tsx scripts/verify-staff-phase5.ts
   Cleans up all bootstrap rows afterwards. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const BASE = process.env.STAFF_API_URL || "http://localhost:5000/api/v1";
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
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const TD = "phase5.verify.local";
const email = (n: string) => `${n}@${TD}`;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TD}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.approval.deleteMany({
      where: {
        OR: [
          { approverUserId: { in: ids } },
          { student: { userId: { in: ids } } },
          { subject: { code: { startsWith: "P5" } } },
        ],
      },
    });
    await prisma.subjectStaff.deleteMany({
      where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { code: { startsWith: "P5" } } }] },
    });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P5" } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { name: "P5 Isolation" } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } else {
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P5" } } });
    await prisma.classroom.deleteMany({ where: { name: "P5 Isolation" } });
  }
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const staffUser = await prisma.user.findUniqueOrThrow({ where: { email: "staff.cse@institution.edu" } });
  const staffProfile = await prisma.staff.findUniqueOrThrow({ where: { userId: staffUser.id } });
  const advisorClassroom = await prisma.classroom.findFirstOrThrow({
    where: { name: "CSE-IV-A", departmentId: cse.id },
  });

  // Subject in staff's reach + mapping (bootstrap what advisor UI would do)
  const subjectA = await prisma.subject.create({
    data: { code: "P5SUBJA", name: "Phase Five Subject A", credits: 3, semester: 7, departmentId: cse.id, classroomId: advisorClassroom.id },
  });
  await prisma.subjectStaff.create({ data: { subjectId: subjectA.id, staffId: staffProfile.id } });

  // Second staff + unassigned subject + foreign classroom/student (isolation)
  const staffBUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "TutorB", email: email("staff-b"), passwordHash, role: Role.STAFF, departmentId: cse.id },
  });
  const staffB = await prisma.staff.create({
    data: { userId: staffBUser.id, employeeCode: "P5EMPB", departmentId: cse.id, designation: "Lecturer" },
  });
  const subjectB = await prisma.subject.create({
    data: { code: "P5SUBJB", name: "Phase Five Subject B", credits: 3, semester: 7, departmentId: cse.id, classroomId: advisorClassroom.id },
  });
  await prisma.subjectStaff.create({ data: { subjectId: subjectB.id, staffId: staffB.id } });

  const roomX = await prisma.classroom.create({
    data: { name: "P5 Isolation", batch: "2024-2028", semester: 2, section: "Z", departmentId: cse.id },
  });
  const pupilXUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "PupilX", email: email("pupil-x"), passwordHash, role: Role.STUDENT, departmentId: cse.id },
  });
  const pupilX = await prisma.student.create({
    data: { userId: pupilXUser.id, registerNumber: "P5REGX", classroomId: roomX.id, departmentId: cse.id, admissionYear: 2024 },
  });

  // Role probes
  for (const role of [Role.ADMIN, Role.HOD, Role.ADVISOR, Role.STUDENT] as const) {
    await prisma.user.create({
      data: { firstName: "Probe", lastName: role, email: email(`probe-${role.toLowerCase()}`), passwordHash, role, departmentId: cse.id },
    });
  }

  const staffTok = await login("staff.cse@institution.edu", "Staff@12345");
  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const hodTok = await login(email("probe-hod"), "Verify@12345");
  const advisorTok = await login(email("probe-advisor"), "Verify@12345");
  const studentTok = await login(email("probe-student"), "Verify@12345");

  const ada = await prisma.student.findFirstOrThrow({
    where: { user: { email: "student.cse@institution.edu" } },
  });

  // ─── 1. RBAC ──────────────────────────────────────────────────────────
  console.log("1. Role RBAC");
  let r = await api(null, "GET", "/staff/dashboard");
  expect(r.status === 401, "unauthenticated -> 401", r.status);
  for (const [tok, role] of [[adminTok, "ADMIN"], [hodTok, "HOD"], [advisorTok, "ADVISOR"], [studentTok, "STUDENT"]] as const) {
    r = await api(tok, "GET", "/staff/dashboard");
    expect(r.status === 403, `${role} -> 403`, r.status);
  }
  r = await api(staffTok, "GET", "/staff/dashboard");
  expect(r.status === 200, "STAFF -> 200", r.status);
  expect(
    typeof r.json.data?.counts?.subjects === "number" && Array.isArray(r.json.data?.recentDecisions),
    "dashboard shape ok"
  );

  // ─── 2. Subjects isolation ────────────────────────────────────────────
  console.log("2. Subjects");
  r = await api(staffTok, "GET", "/staff/subjects");
  expect(r.status === 200 && r.json.data.some((s: any) => s.id === subjectA.id), "lists assigned subject", r.status);
  expect(!r.json.data.some((s: any) => s.id === subjectB.id), "unassigned subject absent");
  r = await api(staffTok, "GET", `/staff/subjects/${subjectB.id}`);
  expect(r.status === 403, "other staff subject -> 403", r.status);
  r = await api(staffTok, "GET", "/staff/subjects/00000000-0000-4000-8000-000000000000");
  expect(r.status === 404, "missing subject -> 404", r.status);
  r = await api(staffTok, "GET", `/staff/subjects/${subjectA.id}`);
  expect(r.status === 200 && Array.isArray(r.json.data?.students), "subject detail + students", r.status);

  // ─── 3. Students isolation ────────────────────────────────────────────
  console.log("3. Students");
  r = await api(staffTok, "GET", "/staff/students");
  expect(r.status === 200 && r.json.data.some((s: any) => s.id === ada.id), "lists classroom student", r.status);
  r = await api(staffTok, "GET", `/staff/students/${pupilX.id}`);
  expect(r.status === 403, "foreign classroom student -> 403", r.status);
  r = await api(staffTok, "GET", `/staff/students/${ada.id}`);
  expect(r.status === 200, "own student detail -> 200", r.status);

  // ─── 4. Approvals: pending → approve → reject → idempotent → conflict ──
  console.log("4. Approvals");
  r = await api(staffTok, "GET", "/staff/approvals?status=pending");
  expect(r.status === 200, "pending list 200", r.status);
  const pendingPair = r.json.data.find(
    (p: any) => p.student?.id === ada.id && p.subject?.id === subjectA.id
  );
  expect(!!pendingPair, "expected pending pair present");

  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id,
    subjectId: subjectA.id,
    decision: "APPROVED",
  });
  expect(r.status === 201, "approve -> 201", r.status);

  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id,
    subjectId: subjectA.id,
    decision: "APPROVED",
  });
  expect(r.status === 200, "re-approve idempotent -> 200", r.status);

  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id,
    subjectId: subjectA.id,
    decision: "REJECTED",
    remarks: "changed mind",
  });
  expect(r.status === 409, "decision change -> 409", r.status);

  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: pupilX.id,
    subjectId: subjectA.id,
    decision: "APPROVED",
  });
  expect(r.status === 403, "approve foreign student -> 403", r.status);

  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id,
    subjectId: subjectB.id,
    decision: "APPROVED",
  });
  expect(r.status === 403, "approve unassigned subject -> 403", r.status);

  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id,
    subjectId: subjectA.id,
    decision: "MAYBE",
  });
  expect(r.status === 400, "invalid decision -> 400", r.status);

  // reject path on a fresh pair (second subject for same student)
  const subjectC = await prisma.subject.create({
    data: { code: "P5SUBJC", name: "Phase Five Subject C", credits: 2, semester: 7, departmentId: cse.id, classroomId: advisorClassroom.id },
  });
  await prisma.subjectStaff.create({ data: { subjectId: subjectC.id, staffId: staffProfile.id } });
  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id,
    subjectId: subjectC.id,
    decision: "REJECTED",
  });
  expect(r.status === 400, "reject without remarks -> 400", r.status);
  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id,
    subjectId: subjectC.id,
    decision: "REJECTED",
    remarks: "Lab records incomplete",
  });
  expect(r.status === 201, "reject with remarks -> 201", r.status);

  r = await api(staffTok, "GET", "/staff/approvals?status=decided");
  expect(
    r.status === 200 && r.json.data.length >= 2,
    "decided list contains both",
    r.json.data?.length
  );

  // ─── 5. Concurrency: parallel duplicate approve ───────────────────────
  console.log("5. Concurrency");
  const subjectD = await prisma.subject.create({
    data: { code: "P5SUBJD", name: "Phase Five Subject D", credits: 2, semester: 7, departmentId: cse.id, classroomId: advisorClassroom.id },
  });
  await prisma.subjectStaff.create({ data: { subjectId: subjectD.id, staffId: staffProfile.id } });
  const payload = { studentId: ada.id, subjectId: subjectD.id, decision: "APPROVED" };
  const [c1, c2] = await Promise.all([
    api(staffTok, "POST", "/staff/approvals", payload),
    api(staffTok, "POST", "/staff/approvals", payload),
  ]);
  const codes = [c1.status, c2.status].sort();
  expect(JSON.stringify(codes) === JSON.stringify([200, 201]), "parallel approve -> 201+200, no duplicate", codes);
  const rows = await prisma.approval.count({
    where: { studentId: ada.id, subjectId: subjectD.id, approverRole: Role.STAFF },
  });
  expect(rows === 1, "exactly one approval row", rows);

  // ─── 6. Audit ─────────────────────────────────────────────────────────
  console.log("6. Audit");
  const logs = await prisma.auditLog.findMany({
    where: { action: { in: ["STAFF_APPROVAL_APPROVED", "STAFF_APPROVAL_REJECTED"] }, actorUserId: staffUser.id },
    select: { action: true, entityType: true, metadata: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  expect(logs.length >= 3, "approval audit rows written", logs.length);
  expect(
    logs.every((l) => l.entityType === "Approval"),
    "audit entity types correct"
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
