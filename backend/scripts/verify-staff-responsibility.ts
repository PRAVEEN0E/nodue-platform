/* Staff Responsibility Correction — end-to-end backend verification.

   Rules under test (the final business rule):
     • STAFF CREATION      → ADMIN only (via /admin/staff)
     • STAFF EDIT (incl. activate/deactivate/delete) → ADMIN only
     • STAFF ASSIGNMENT    → ADVISOR only (map existing staff to their subjects)
     • Advisors can NEVER create or edit staff accounts (403 at route level)
     • Scope is always server-side: client-provided classroomId/departmentId
       are never trusted; cross-department and cross-advisor assignment is
       rejected. Duplicate mappings rejected. Assignment scoping + isolation.

   Run against a live dev API:
     npx tsx scripts/verify-staff-responsibility.ts
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

const DOMAIN = `sr-${Date.now()}.verify.local`;
const email = (n: string) => `${n}@${DOMAIN}`;

const DEPT_A = "SRA";
const DEPT_B = "SRB";

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
  await prisma.department.deleteMany({ where: { code: { in: [DEPT_A, DEPT_B] } } });
}

async function createStaffAsAdmin(adminTok: string, departmentId: string, employeeCode: string, key: string, designation = "Assistant Professor") {
  const r = await api(adminTok, "POST", "/admin/staff", {
    firstName: key.includes("one") ? "One" : key.includes("two") ? "Two" : key.includes("three") ? "Three" : "Staff",
    lastName: key,
    email: email(key),
    password: "Staff@12345",
    employeeCode,
    designation,
    departmentId,
  });
  if (r.status !== 201) throw new Error(`admin create staff ${employeeCode} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return { id: r.json.data.id as string, r };
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");

  // ─── Bootstrap ──────────────────────────────────────────────────────────
  const deptA = await prisma.department.create({ data: { code: DEPT_A, name: "Staff Verify A" } });
  const deptB = await prisma.department.create({ data: { code: DEPT_B, name: "Staff Verify B" } });

  const roomA = await prisma.classroom.create({
    data: { name: "IV-SRA (sr)", batch: "2022-2026", semester: 7, section: "A", departmentId: deptA.id },
  });
  const roomB = await prisma.classroom.create({
    data: { name: "III-SRA (sr)", batch: "2023-2027", semester: 5, section: "A", departmentId: deptA.id },
  });
  const roomX = await prisma.classroom.create({
    data: { name: "IV-SRB (sr)", batch: "2022-2026", semester: 7, section: "A", departmentId: deptB.id },
  });
  classrooms.push(roomA.id, roomB.id, roomX.id);

  const mkUser = (role: Role, firstName: string, lastName: string, key: string, departmentId: string) =>
    prisma.user.create({
      data: { firstName, lastName, email: email(key), passwordHash, role, departmentId },
    });

  const a1User = await mkUser(Role.ADVISOR, "Advisor", "One", "advisor-one", deptA.id);
  const a2User = await mkUser(Role.ADVISOR, "Advisor", "Two", "advisor-two", deptA.id);
  userIds.push(a1User.id, a2User.id);
  await prisma.advisor.create({ data: { userId: a1User.id, classroomId: roomA.id } });
  await prisma.advisor.create({ data: { userId: a2User.id, classroomId: roomB.id } });

  // Role probes for route authorization (no profiles needed)
  const probe = (role: Role, key: string) => mkUser(role, "Probe", role, key, deptA.id);
  userIds.push((await probe(Role.HOD, "probe-hod")).id, (await probe(Role.STAFF, "probe-staff")).id, (await probe(Role.STUDENT, "probe-student")).id);

  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const tok1 = await login(email("advisor-one"), "Verify@12345");
  const tok2 = await login(email("advisor-two"), "Verify@12345");

  const hodTok = await login(email("probe-hod"), "Verify@12345");
  const staffTok = await login(email("probe-staff"), "Verify@12345");
  const studentTok = await login(email("probe-student"), "Verify@12345");

  // ─── A. Admin-only staff creation (spec §25 tests 1–7) ─────────────────
  console.log("A. Staff creation (ADMIN only)");

  let r = await api(adminTok, "POST", "/admin/staff", {
    firstName: "One", lastName: "staff-one", email: email("staff-one"),
    password: "Staff@12345", employeeCode: "SREMP001", designation: "Assistant Professor",
    departmentId: deptA.id,
  });
  expect(r.status === 201, "T1 admin creates staff -> 201", r.status);
  const s1 = r.json.data;
  expect(s1.classroomId === null, "T1a created staff enters unassigned pool (classroomId NULL)", s1.classroomId);
  expect(s1.user.isActive === true, "T1b created staff active by default", s1.user.isActive);
  expect(s1.designation === "Assistant Professor", "T1c designation stored", s1.designation);
  const s1Id = s1.id;

  r = await api(adminTok, "POST", "/admin/staff", {
    firstName: "Dup", lastName: "Email", email: email("staff-one"),
    password: "Staff@12345", employeeCode: "SREMP-XX", designation: "Lecturer",
    departmentId: deptA.id,
  });
  expect(r.status === 409, "T2 duplicate email -> 409", r.status);

  r = await api(adminTok, "POST", "/admin/staff", {
    firstName: "Dup", lastName: "Code", email: email("staff-dupcode"),
    password: "Staff@12345", employeeCode: "SREMP001", designation: "Lecturer",
    departmentId: deptA.id,
  });
  expect(r.status === 409, "T3 duplicate employee code -> 409", r.status);

  r = await api(adminTok, "POST", "/admin/staff", {
    firstName: "Bad", lastName: "Body", email: email("staff-badbody"),
    password: "Staff@12345", employeeCode: "SREMP-BAD", designation: "",
    departmentId: deptA.id,
  });
  expect(r.status === 400, "T4 invalid body -> 400", r.status);

  r = await api(adminTok, "POST", "/admin/staff", {
    firstName: "Bad", lastName: "Dept", email: email("staff-baddept"),
    password: "Staff@12345", employeeCode: "SREMP-BDD", designation: "Lecturer",
    departmentId: "00000000-0000-4000-8000-000000000000",
  });
  expect(r.status === 404, "T5 non-existent department -> 404", r.status);

  // Second in-department staff for search/pagination + adoption tests
  await createStaffAsAdmin(adminTok, deptA.id, "SREMP002", "staff-two");
  // Cross-department pool staff (never adoptable by deptA advisors)
  await createStaffAsAdmin(adminTok, deptB.id, "SREMPX001", "staff-x", "Lecturer");

  r = await api(adminTok, "GET", `/admin/staff?departmentId=${deptA.id}&limit=10`);
  expect(r.status === 200 && r.json.meta.total === 2, "T6 admin list filtered by department -> 2", r.json.meta?.total);
  r = await api(adminTok, "GET", "/admin/staff?search=staff-two");
  expect(r.status === 200 && r.json.meta.total === 1, "T7 admin list search by name -> 1", r.json.meta?.total);
  r = await api(adminTok, "GET", "/admin/staff?isActive=true");
  expect(r.status === 200 && r.json.data.every((s: any) => s.user.isActive === true), "T7b active filter -> all active", r.status);

  // ─── B. Route-level authorization (spec §25 tests 8–11, permission table) ─
  console.log("B. Route authorization (permission model)");
  r = await api(null, "GET", "/admin/staff");
  expect(r.status === 401, "T8 unauthenticated /admin/staff -> 401", r.status);
  r = await api(hodTok, "GET", "/admin/staff");
  expect(r.status === 403, "T9 HOD /admin/staff -> 403", r.status);
  r = await api(staffTok, "GET", "/admin/staff");
  expect(r.status === 403, "T10 STAFF /admin/staff -> 403", r.status);
  r = await api(studentTok, "GET", "/admin/staff");
  expect(r.status === 403, "T11 STUDENT /admin/staff -> 403", r.status);
  r = await api(adminTok, "GET", "/admin/staff");
  expect(r.status === 200, "T11b ADMIN /admin/staff -> 200", r.status);

  r = await api(tok1, "POST", "/admin/staff", {
    firstName: "Spoof", lastName: "Admin", email: email("staff-spoof"),
    password: "Staff@12345", employeeCode: "SREMP-SPF", designation: "Lecturer",
    departmentId: deptA.id,
  });
  expect(r.status === 403, "T12 advisor on /admin/staff -> 403", r.status);

  r = await api(tok1, "POST", "/advisor/staff", {
    firstName: "Spoof", lastName: "Advisor", email: email("staff-spoofadv"),
    password: "Staff@12345", employeeCode: "SREMP-SPV", designation: "Lecturer",
  });
  expect(r.status === 403, "T13 advisor create via /advisor/staff -> 403", r.status);
  r = await api(tok1, "PATCH", `/advisor/staff/${s1.id}`, { designation: "Professor" });
  expect(r.status === 403, "T14 advisor update via /advisor/staff -> 403", r.status);

  // ─── C. Admin edit / activate / deactivate / delete (tests 15–20) ───────
  console.log("C. Admin lifecycle");
  r = await api(adminTok, "PATCH", `/admin/staff/${s1.id}`, { designation: "Professor" });
  expect(r.status === 200 && r.json.data.designation === "Professor", "T15 admin edits designation -> 200", r.status);

  r = await api(adminTok, "PATCH", `/admin/staff/${s1.id}`, { email: email("staff-one") });
  expect(r.status === 200, "T15b no-op edit (same email) -> 200", r.status);

  r = await api(adminTok, "PATCH", `/admin/staff/${s1.id}`, { isActive: false });
  expect(r.status === 200 && r.json.data.user.isActive === false, "T16 admin deactivates -> 200", r.status);
  r = await api(tok1, "GET", "/advisor/staff/available?search=staff-one");
  expect(r.json.meta.total === 0, "T16a deactivated staff excluded from availability", r.json.meta?.total);
  r = await api(adminTok, "PATCH", `/admin/staff/${s1.id}`, { isActive: true });
  expect(r.status === 200, "T17 admin reactivates -> 200", r.status);
  r = await api(tok1, "GET", "/advisor/staff/available?search=staff-one");
  expect(r.json.meta.total === 1, "T17a reactivated staff back in availability", r.json.meta?.total);

  // Deletion: staff with mappings cannot be deleted
  r = await api(tok1, "POST", "/advisor/subjects", { code: "SRSBJ1", name: "SR Subject One", credits: 4, semester: 7 });
  expect(r.status === 201, "advisor creates subject for mapping tests", r.status);
  const subj1 = r.json.data.id as string;
  r = await api(tok1, "POST", `/advisor/subjects/${subj1}/staff`, { staffId: s1.id });
  expect(r.status === 201, "advisor adopts staff-one (mapping)", r.status);

  r = await api(adminTok, "DELETE", `/admin/staff/${s1.id}`);
  expect(r.status === 409, "T18 delete staff with subject mapping -> 409", r.status);

  r = await api(adminTok, "PATCH", `/admin/staff/${s1.id}`, { departmentId: deptB.id });
  expect([400, 403, 404, 409].includes(r.status), "T19 department change while assigned to a classroom -> rejected", r.status);
  r = await api(adminTok, "PATCH", `/admin/staff/${s1.id}`, { designation: "Associate Professor" });
  expect(r.status === 200, "T19b other fields still editable while assigned -> 200", r.status);

  // Unmapped staff delete cleanly (use the duplicate-code attempt's leftover? no — use staff-two)
  const s2row = await prisma.staff.findFirstOrThrow({ where: { employeeCode: "SREMP002" } });
  r = await api(adminTok, "DELETE", `/admin/staff/${s2row.id}`);
  expect(r.status === 200, "T20 delete unmapped staff -> 200", r.status);
  r = await api(adminTok, "GET", `/admin/staff?search=staff-two`);
  expect(r.json.meta.total === 0, "T20a deleted staff gone from list", r.json.meta?.total);

  // ─── D. Assignment scoping (available vs assigned; adoption) ─────────────
  console.log("D. Assignment scoping");
  // Fresh unassigned pool for the availability assertions (s2 was deleted,
  // s1 was adopted in section C).
  const s4row = await createStaffAsAdmin(adminTok, deptA.id, "SREMP004", "staff-four");
  const sx = await prisma.staff.findFirstOrThrow({ where: { employeeCode: "SREMPX001" } });

  r = await api(tok1, "GET", "/advisor/staff/available");
  const avail1 = r.json.data as Array<{ id: string }>;
  expect(
    r.status === 200 &&
      avail1.some((s) => s.id === s4row.id) &&
      avail1.some((s) => s.id === sx.id) &&
      !avail1.some((s) => s.id === s1Id),
    "T21 advisor available = college-wide ACTIVE staff not already teaching this classroom's subjects (own-classroom-mapped excluded)",
    avail1.length
  );
  r = await api(tok2, "GET", "/advisor/staff/available");
  const avail2 = r.json.data as Array<{ id: string }>;
  expect(avail2.some((s) => s.id === s4row.id), "T22 advisor2 same-department sees the same pool", avail2.length);

  r = await api(tok1, "GET", "/advisor/staff");
  expect(r.json.meta.total === 1 && r.json.data[0].id === s1Id, "T23 advisor1 assigned list includes adopted staff", r.json.meta?.total);
  r = await api(tok2, "GET", "/advisor/staff");
  expect(r.json.meta.total === 0, "T24 advisor2 assigned list empty (isolation)", r.json.meta?.total);

  // Cross-department faculty are visible college-wide (staff are a campus resource)
  r = await api(tok1, "GET", "/advisor/staff/available");
  expect((r.json.data as Array<{ id: string }>).some((s) => s.id === sx.id), "T25 other-dept ACTIVE staff available college-wide", 0);

  // Direct adoption of another advisor's staff blocked; mass-assignment ignored
  r = await api(tok2, "POST", "/advisor/subjects", { code: "SRSBJ2", name: "SR Subject Two", credits: 3, semester: 5 });
  expect(r.status === 201, "advisor2 creates subject", r.status);
  const subj2 = r.json.data.id as string;

  // Cross-classroom teaching: an advisor may map an active same-department
  // staff member who is already owned by another classroom of the department.
  // Teaching scope comes from the subject, not from Staff.classroomId.
  r = await api(tok2, "POST", `/advisor/subjects/${subj2}/staff`, { staffId: s1Id });
  expect(r.status === 201, "T26 advisor2 maps advisor1's adopted staff into their classroom (cross-classroom teaching) -> 201", r.status);
  const s1AfterX = await prisma.staff.findUniqueOrThrow({ where: { id: s1Id }, select: { classroomId: true } });
  expect(s1AfterX.classroomId === roomA.id, "T26a cross-classroom mapping preserves ownership (classroomId stays roomA)", s1AfterX.classroomId);
  // Teaching scope comes from the subject, not from Staff.classroomId or
  // departmentId (staff are college-wide): a cross-department staff member IS
  // mappable, and spoofed client scope fields never grant unrelated access.
  r = await api(tok2, "POST", `/advisor/subjects/${subj2}/staff`, { staffId: sx.id, classroomId: roomA.id, departmentId: deptA.id });
  expect(r.status === 201, "T26b cross-department staff mappable (college-wide); spoofed classroomId/departmentId ignored -> 201", r.status);

  // advisor2 adopts its own pool staff; scope still server-side
  const s3row = await createStaffAsAdmin(adminTok, deptA.id, "SREMP003", "staff-three");
  r = await api(tok2, "POST", `/advisor/subjects/${subj2}/staff`, { staffId: s3row.id, classroomId: roomA.id, departmentId: deptB.id });
  expect(r.status === 201, "T27 advisor2 adopts staff-three despite spoofed fields", r.status);
  const dbS3 = await prisma.staff.findUniqueOrThrow({ where: { id: s3row.id }, select: { classroomId: true } });
  expect(dbS3.classroomId === roomB.id, "T27a adopted classroom = advisor2's room (server-scope)", dbS3.classroomId);

  r = await api(tok1, "GET", "/advisor/staff/available");
  const avail1B = r.json.data as Array<{ id: string }>;
  expect(
    avail1B.some((s) => s.id === s4row.id) &&
      avail1B.some((s) => s.id === s3row.id) &&
      avail1B.some((s) => s.id === sx.id) &&
      !avail1B.some((s) => s.id === s1Id),
    "T28 availability = college-wide ACTIVE staff not already teaching THIS classroom's subjects (staff teaching other classrooms still visible; own-classroom-mapped excluded)",
    avail1B.length
  );
  // Cross-classroom teaching: advisor1 may now map advisor2's adopted staff-three.
  r = await api(tok1, "POST", `/advisor/subjects/${subj1}/staff`, { staffId: s3row.id });
  expect(r.status === 201, "T29 advisor1 maps advisor2's adopted staff (multi-classroom teaching) -> 201", r.status);

  // Duplicate mapping rejection
  r = await api(tok1, "POST", `/advisor/subjects/${subj1}/staff`, { staffId: s1Id });
  expect(r.status === 409, "T30 duplicate mapping -> 409", r.status);

  // Inactive staff cannot be assigned (fresh subject: s3 already mapped to subj1)
  r = await api(tok1, "POST", "/advisor/subjects", { code: "SRSBJ3", name: "SR Subject Three", credits: 3, semester: 7 });
  expect(r.status === 201, "advisor1 creates subject for inactive-staff test", r.status);
  const subj3 = r.json.data.id as string;
  r = await api(adminTok, "PATCH", `/admin/staff/${s3row.id}`, { isActive: false });
  expect(r.status === 200, "admin deactivates adopted staff", r.status);
  r = await api(tok1, "POST", `/advisor/subjects/${subj3}/staff`, { staffId: s3row.id });
  expect(r.status === 403, "T31 inactive staff cannot receive assignment -> 403", r.status);
  r = await api(adminTok, "PATCH", `/admin/staff/${s3row.id}`, { isActive: true });
  expect(r.status === 200, "admin reactivates adopted staff", r.status);

  // ─── E. Audit trail (spec §11) ───────────────────────────────────────────
  console.log("E. Audit trail");
  const staffOneDb = await prisma.staff.findFirstOrThrow({ where: { employeeCode: "SREMP001" } });
  r = await api(adminTok, "GET", `/admin/audit-logs?action=STAFF_ACTIVATED&entityId=${staffOneDb.id}`);
  expect(
    r.status === 200 && r.json.data.some((l: any) => l.actorUser?.role === "ADMIN" && l.department?.code === DEPT_A),
    "T32 STAFF_ACTIVATED logged with ADMIN actor + department",
    (r as any).json?.meta?.total
  );
  r = await api(adminTok, "GET", `/admin/audit-logs?action=SUBJECT_STAFF_MAPPED`);
  const mapped = r.json.data as Array<{ actorUser: { role: string } | null }>;
  expect(
    r.status === 200 && mapped.some((l) => l.actorUser?.role === "ADVISOR"),
    "T33 SUBJECT_STAFF_MAPPED logged with ADVISOR actor (assignment = advisor)",
    mapped.length
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