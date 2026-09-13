/* Phase 8 verification: department/classroom/staff/student isolation,
   IDOR matrix, mass-assignment resistance. Run against live dev API:
     npx tsx scripts/verify-isolation-phase8.ts
   Cleans up bootstrap rows afterwards. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const BASE = process.env.ISOLATION_API_URL || "http://localhost:5000/api/v1";
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

function denied(status: number) {
  return status === 403 || status === 404;
}

const TD = "phase8.verify.local";
const email = (n: string) => `${n}@${TD}`;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TD}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.approval.deleteMany({
      where: { OR: [{ approverUserId: { in: ids } }, { student: { userId: { in: ids } } }, { subject: { code: { startsWith: "P8" } } }] },
    });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subjectStaff.deleteMany({
      where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { code: { startsWith: "P8" } } }] },
    });
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P8" } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { name: { startsWith: "P8" } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } else {
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P8" } } });
    await prisma.classroom.deleteMany({ where: { name: { startsWith: "P8" } } });
  }
}

async function main() {
  await cleanup();

  const hash = await hashPassword("Verify@12345");
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const ece = await prisma.department.findUniqueOrThrow({ where: { code: "ECE" } });

  // Second classroom in CSE (advisor.cse must NOT see it)
  const roomP8 = await prisma.classroom.create({
    data: { name: "P8 Second", batch: "2024-2028", semester: 2, section: "Z", departmentId: cse.id },
  });
  const stuP8User = await prisma.user.create({
    data: { firstName: "Phase", lastName: "Pupil8", email: email("pupil-8"), passwordHash: hash, role: Role.STUDENT, departmentId: cse.id },
  });
  const stuP8 = await prisma.student.create({
    data: { userId: stuP8User.id, registerNumber: "P8REG8", classroomId: roomP8.id, departmentId: cse.id, admissionYear: 2024 },
  });
  const subP8 = await prisma.subject.create({
    data: { code: "P8SUB8", name: "Phase Eight Subject", credits: 3, semester: 2, departmentId: cse.id, classroomId: roomP8.id },
  });
  const feeP8 = await prisma.fee.create({
    data: { studentId: stuP8.id, title: "Tuition P8", totalAmount: 40000, paidAmount: 0, status: "PENDING" },
  });

  // Full ECE fixture set (HOD cross-department targets)
  const roomE = await prisma.classroom.create({
    data: { name: "P8 Ece", batch: "2024-2028", semester: 2, section: "Z", departmentId: ece.id },
  });
  const advEUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "AdvisorE", email: email("advisor-e"), passwordHash: hash, role: Role.ADVISOR, departmentId: ece.id },
  });
  await prisma.advisor.create({ data: { userId: advEUser.id, classroomId: roomE.id } });
  const stuEUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "PupilE", email: email("pupil-e"), passwordHash: hash, role: Role.STUDENT, departmentId: ece.id },
  });
  const stuE = await prisma.student.create({
    data: { userId: stuEUser.id, registerNumber: "P8REGE", classroomId: roomE.id, departmentId: ece.id, admissionYear: 2024 },
  });
  const staffEUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "TutorE", email: email("staff-e"), passwordHash: hash, role: Role.STAFF, departmentId: ece.id },
  });
  const staffE = await prisma.staff.create({
    data: { userId: staffEUser.id, employeeCode: "P8EMPE", departmentId: ece.id, designation: "Lecturer" },
  });
  const subE = await prisma.subject.create({
    data: { code: "P8SUBE", name: "Phase Eight E Subject", credits: 3, semester: 2, departmentId: ece.id, classroomId: roomE.id },
  });
  const feeE = await prisma.fee.create({
    data: { studentId: stuE.id, title: "Tuition E", totalAmount: 40000, paidAmount: 0, status: "PENDING" },
  });

  const hodTok = await login("hod.cse@institution.edu", "Hod@12345");
  const advisorTok = await login("advisor.cse@institution.edu", "Advisor@12345");
  const staffTok = await login("staff.cse@institution.edu", "Staff@12345");

  const ada = await prisma.student.findFirstOrThrow({
    where: { user: { email: "student.cse@institution.edu" } },
    select: { id: true },
  });
  const ownRoom = await prisma.classroom.findFirstOrThrow({ where: { name: "CSE-IV-A" } });

  // ─── 1. HOD department isolation ──────────────────────────────────────
  console.log("1. HOD department isolation");
  let r = await api(hodTok, "GET", "/hod/classrooms");
  const cseRoomIds = new Set(
    (await prisma.classroom.findMany({ where: { departmentId: cse.id }, select: { id: true } })).map((c) => c.id)
  );
  expect(
    r.status === 200 &&
      (r.json.data as any[]).length > 0 &&
      (r.json.data as any[]).every((c: any) => cseRoomIds.has(c.id)),
    "classroom list contains only own department",
    r.status
  );
  r = await api(hodTok, "GET", `/hod/classrooms/${roomE.id}`);
  expect(denied(r.status), "cross-dept classroom read denied", r.status);
  r = await api(hodTok, "PATCH", `/hod/classrooms/${roomE.id}`, { name: "Hacked" });
  expect(denied(r.status), "cross-dept classroom write denied", r.status);
  r = await api(hodTok, "GET", `/hod/advisors/${advEUser.id}`);
  expect(denied(r.status), "cross-dept advisor read denied", r.status);
  r = await api(hodTok, "POST", "/hod/advisors", {
    firstName: "Bad", lastName: "Actor", email: email("bad-actor"), password: "Bad@12345", classroomId: roomE.id,
  });
  expect(denied(r.status), "advisor creation into foreign classroom denied", r.status);
  r = await api(hodTok, "POST", `/hod/advisors/${advEUser.id}/assign-classroom`, { classroomId: ownRoom.id });
  expect(denied(r.status), "foreign advisor assignment denied", r.status);
  r = await api(hodTok, "GET", "/hod/audit-logs?limit=5");
  expect(r.status === 200, "audit list scoped 200", r.status);
  r = await api(hodTok, "POST", "/hod/approvals", { studentId: stuE.id, decision: "APPROVED" });
  expect(denied(r.status), "cross-dept approval denied", r.status);
  r = await api(hodTok, "POST", "/hod/fees/approve", { studentId: stuE.id });
  expect(denied(r.status), "cross-dept fee verification approve denied", r.status);
  r = await api(hodTok, "GET", "/hod/fees?limit=50");
  const feeRows = (r.json.data as any[]) ?? [];
  const feeClassrooms = new Set(feeRows.map((f: any) => f.classroomName).filter(Boolean));
  // roomP8 is CSE (same department) so its students legitimately appear;
  // only the ECE classroom must be absent.
  const foreignClassrooms = [...feeClassrooms].filter((n) => n === roomE.name);
  expect(
    r.status === 200 && foreignClassrooms.length === 0,
    "fee verification list contains only own department",
    [...feeClassrooms]
  );

  // ─── 2. Advisor classroom isolation ───────────────────────────────────
  console.log("2. Advisor classroom isolation");
  r = await api(advisorTok, "GET", `/advisor/students/${stuP8.id}`);
  expect(denied(r.status), "other-classroom student read denied", r.status);
  r = await api(advisorTok, "PATCH", `/advisor/students/${stuP8.id}`, { isActive: false });
  expect(denied(r.status), "other-classroom student write denied", r.status);
  r = await api(advisorTok, "GET", `/advisor/subjects/${subP8.id}`);
  expect(denied(r.status), "other-classroom subject read denied", r.status);
  r = await api(advisorTok, "POST", `/advisor/subjects/${subP8.id}/staff`, { staffId: staffE.id });
  expect(denied(r.status), "mapping into foreign subject denied", r.status);
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: stuP8.id });
  expect(denied(r.status), "other-classroom fee verification approve denied", r.status);
  r = await api(advisorTok, "POST", "/advisor/approvals", { studentId: stuP8.id, decision: "APPROVED" });
  expect(denied(r.status), "other-classroom approval denied", r.status);
  r = await api(advisorTok, "GET", "/advisor/fees");
  expect(
    r.status === 200 && (r.json.data as any[]).every((x) => x.studentId !== stuP8.id),
    "other-classroom student absent from fee verification list"
  );
  r = await api(advisorTok, "GET", "/advisor/students?search=P8REG8");
  expect(r.status === 200 && (r.json.data as any[]).length === 0, "other-classroom student absent from search");

  // ─── 3. Staff isolation (second vector) ───────────────────────────────
  console.log("3. Staff isolation");
  r = await api(staffTok, "GET", `/staff/subjects/${subP8.id}`);
  expect(denied(r.status), "unmapped subject denied", r.status);
  r = await api(staffTok, "GET", `/staff/students/${stuP8.id}`);
  expect(denied(r.status), "out-of-scope student denied", r.status);
  r = await api(staffTok, "POST", "/staff/approvals", { studentId: stuP8.id, subjectId: subP8.id, decision: "APPROVED" });
  expect(denied(r.status), "out-of-scope approval denied", r.status);

  // ─── 4. Mass assignment ───────────────────────────────────────────────
  console.log("4. Mass assignment resistance");
  const evilStudent = {
    firstName: "Ada",
    lastName: "Lovelace",
    role: "ADMIN",
    departmentId: ece.id,
    classroomId: roomP8.id,
    isVerified: true,
    passwordHash: "hacked",
    userId: "00000000-0000-4000-8000-000000000000",
  };
  r = await api(advisorTok, "PATCH", `/advisor/students/${ada.id}`, evilStudent);
  expect(r.status === 200, "patch accepts (strips) 200", r.status);
  const adaAfter = await prisma.user.findUniqueOrThrow({
    where: { id: (await prisma.student.findUniqueOrThrow({ where: { id: ada.id }, select: { userId: true } })).userId },
    select: { role: true, departmentId: true, passwordHash: true },
  });
  const adaStudent = await prisma.student.findUniqueOrThrow({ where: { id: ada.id }, select: { classroomId: true } });
  expect(adaAfter.role === Role.STUDENT, "role unchanged");
  expect(adaAfter.departmentId === cse.id, "department unchanged");
  expect(adaStudent.classroomId !== roomP8.id, "classroom unchanged");
  expect(adaAfter.passwordHash !== "hacked", "passwordHash unchanged");

  r = await api(hodTok, "PATCH", `/hod/classrooms/${ownRoom.id}`, { departmentId: ece.id, hodUserId: ada.id } as any);
  const roomAfter = await prisma.classroom.findUniqueOrThrow({ where: { id: ownRoom.id }, select: { departmentId: true } });
  expect(roomAfter.departmentId === cse.id, "classroom department unchanged", r.status);

  r = await api(staffTok, "POST", "/staff/approvals", {
    studentId: ada.id, subjectId: subP8.id, decision: "APPROVED", approverRole: "HOD", approverUserId: ada.id, status: "APPROVED",
  } as any);
  expect(denied(r.status), "approval with forged fields denied", r.status);

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
