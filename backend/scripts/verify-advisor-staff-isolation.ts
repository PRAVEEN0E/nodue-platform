/* Advisor Staff Isolation regression (assignment-only model): staff accounts
   are created by ADMIN into the department's unassigned pool. Advisors see the
   department's available pool and adopt staff into their own classroom by
   mapping them to a subject. A staff member's OWNERSHIP classroom never leaks
   to another advisor (list, search, count, detail/IDOR, edit denial) — but
   because teaching scope comes from the SUBJECT mapping, an advisor may map
   an active same-department staff member (even one owned by another
   classroom) into their classroom's subjects (multi-classroom teaching).

   Run against a live dev API:
     npx tsx scripts/verify-advisor-staff-isolation.ts
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

const DOMAIN = `isv-${Date.now()}.verify.local`;
const email = (n: string) => `${n}@${DOMAIN}`;

const DEPT_CODE = "AVML-ISV";

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

async function createStaffAsAdmin(adminTok: string, departmentId: string, code: string, key: string) {
  const r = await api(adminTok, "POST", "/admin/staff", {
    firstName: "Staff",
    lastName: key.includes("one") ? "One" : "Two",
    email: email(key),
    password: "Staff@12345",
    employeeCode: code,
    designation: "Assistant Professor",
    departmentId,
  });
  if (r.status !== 201) throw new Error(`admin create staff ${code} failed: ${r.status}`);
  return (r as any).json.data.id as string;
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");

  // ─── Bootstrap: AIML department, IV-AIML (Advisor 01) + III-AIML (Advisor 02) ─
  const dept = await prisma.department.create({
    data: { code: DEPT_CODE, name: "AIML Isolation Verify" },
  });
  const deptId = dept.id;

  const classroomIV = await prisma.classroom.create({
    data: { name: "IV-AIML (isv)", batch: "2022-2026", semester: 7, section: "A", departmentId: deptId },
  });
  const classroomIII = await prisma.classroom.create({
    data: { name: "III-AIML (isv)", batch: "2023-2027", semester: 5, section: "A", departmentId: deptId },
  });
  classrooms.push(classroomIV.id, classroomIII.id);

  const mkUser = (role: Role, firstName: string, lastName: string, key: string) =>
    prisma.user.create({
      data: { firstName, lastName, email: email(key), passwordHash, role, departmentId: deptId },
    });

  const a1User = await mkUser(Role.ADVISOR, "Advisor", "One", "advisor-one");
  const a2User = await mkUser(Role.ADVISOR, "Advisor", "Two", "advisor-two");
  userIds.push(a1User.id, a2User.id);

  await prisma.advisor.create({ data: { userId: a1User.id, classroomId: classroomIV.id } });
  await prisma.advisor.create({ data: { userId: a2User.id, classroomId: classroomIII.id } });

  // Department-unassigned staff (classroomId NULL) — the ADMIN-owned pool.
  const unassignedUser = await mkUser(Role.STAFF, "Unassigned", "Pool", "unassigned-pool");
  await prisma.staff.create({
    data: { userId: unassignedUser.id, employeeCode: "ISVEMP-NULL", departmentId: deptId, designation: "Lecturer" },
  });

  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const tok1 = await login(email("advisor-one"), "Verify@12345");
  const tok2 = await login(email("advisor-two"), "Verify@12345");

  // ─── 1. Admin creates Staff 1 into the department's unassigned pool ───────
  console.log("1. Admin creates Staff 1 (unassigned pool)");
  let r = await api(adminTok, "POST", "/advisor/staff", {
    firstName: "Staff",
    lastName: "One",
    email: email("staff-one"),
    password: "Staff@12345",
    employeeCode: "ISVEMP001",
    designation: "Assistant Professor",
  });
  expect(r.status === 403, "Advisor create still impossible (403 on admin-scoped route)", r.status);

  const staff1Id = await createStaffAsAdmin(adminTok, deptId, "ISVEMP001", "staff-one");
  const dbStaff1 = await prisma.staff.findUniqueOrThrow({ where: { id: staff1Id }, select: { classroomId: true } });
  expect(dbStaff1.classroomId === null, "Staff 1 joins the department pool (classroomId NULL)", dbStaff1.classroomId);

  // ─── 2. Assignment lists: assigned empty; available is department-scoped ───
  console.log("2. Assignment list scoping");
  r = await api(tok1, "GET", "/advisor/staff");
  const list1 = (r as any).json.data as Array<{ id: string }>;
  expect(r.status === 200 && !list1.some((s) => s.id === staff1Id), "Advisor 01 assigned list does NOT include Staff 1 (not adopted yet)", list1.length);
  expect((r as any).json.meta.total === 0, "Advisor 01 assigned total == 0", (r as any).json.meta.total);

  r = await api(tok1, "GET", "/advisor/staff/available");
  const avail1 = (r as any).json.data as Array<{ id: string }>;
  expect(r.status === 200 && avail1.some((s) => s.id === staff1Id), "Advisor 01 available pool includes Staff 1", avail1.length);
  const unassigned = await prisma.staff.findFirstOrThrow({ where: { employeeCode: "ISVEMP-NULL" } });
  expect(avail1.some((s) => s.id === unassigned.id), "Advisor 01 available pool includes department pool staff", avail1.length);

  r = await api(tok2, "GET", "/advisor/staff/available");
  const avail2 = (r as any).json.data as Array<{ id: string }>;
  expect(r.status === 200 && avail2.some((s) => s.id === staff1Id), "Advisor 02 (same department) also sees Staff 1 available", avail2.length);

  // ─── 3. Search scoping (available + assigned) ──────────────────────────────
  console.log("3. Search scoping");
  r = await api(tok1, "GET", "/advisor/staff/available?search=Staff");
  expect((r as any).json.meta.total >= 1, "Advisor 01 available search 'Staff' — college-wide results", (r as any).json.meta.total);
  r = await api(tok2, "GET", "/advisor/staff/available?search=Staff");
  expect((r as any).json.meta.total >= 1, "Advisor 02 available search 'Staff' — college-wide results", (r as any).json.meta.total);
  r = await api(tok2, "GET", `/advisor/staff/available?search=${encodeURIComponent(email("unassigned-pool"))}`);
  expect((r as any).json.meta.total === 1, "pool staff searchable by email in available", (r as any).json.meta.total);

  // ─── 4. Direct IDOR + edit denial ─────────────────────────────────────────
  console.log("4. Direct access (IDOR) + edit denial");
  r = await api(tok1, "GET", `/advisor/staff/${staff1Id}`);
  expect(r.status === 403, "Advisor 01 cannot read unassigned Staff 1 via assigned detail -> 403", r.status);
  r = await api(tok2, "GET", `/advisor/staff/${staff1Id}`);
  expect(r.status === 403, "Advisor 02 cannot read unassigned Staff 1 -> 403", r.status);
  r = await api(tok1, "PATCH", `/advisor/staff/${staff1Id}`, { designation: "Professor" });
  expect(r.status === 403, "Advisor 01 edit denial (admin-only) -> 403", r.status);
  r = await api(tok2, "PATCH", `/advisor/staff/${staff1Id}`, { designation: "Professor" });
  expect(r.status === 403, "Advisor 02 edit denial (admin-only) -> 403", r.status);
  r = await api(tok2, "GET", "/advisor/staff/00000000-0000-4000-8000-000000000000");
  expect(r.status === 404, "missing staff -> 404", r.status);
  r = await api(tok2, "GET", "/advisor/staff/not-a-uuid");
  expect(r.status === 400, "malformed id -> 400", r.status);

  // ─── 5. Dashboard parity (assigned count == 0 until adoption) ─────────────
  console.log("5. Dashboard parity");
  r = await api(tok1, "GET", "/advisor/dashboard");
  expect((r as any).json.data.counts.staff === 0, "Advisor 01 dashboard staff count == 0 (no assignment yet)", (r as any).json.data.counts.staff);
  r = await api(tok2, "GET", "/advisor/dashboard");
  expect((r as any).json.data.counts.staff === 0, "Advisor 02 dashboard staff count == 0", (r as any).json.data.counts.staff);

  // ─── 6. Mapping: adoption + cross-classroom guard ─────────────────────────
  console.log("6. Mapping: adoption + cross-classroom guard");
  r = await api(tok1, "POST", "/advisor/subjects", {
    code: "ISVSUBJ1",
    name: "Isolation Subject One",
    credits: 4,
    semester: 7,
  });
  expect(r.status === 201, "Advisor 01 creates subject -> 201", r.status);
  const subject1Id = (r as any).json.data.id as string;

  r = await api(tok1, "POST", `/advisor/subjects/${subject1Id}/staff`, { staffId: staff1Id });
  expect(r.status === 201, "Advisor 01 adopts Staff 1 by mapping -> 201", r.status);
  const adopted1 = await prisma.staff.findUniqueOrThrow({ where: { id: staff1Id }, select: { classroomId: true } });
  expect(adopted1.classroomId === classroomIV.id, "Staff 1 scoped to Advisor 01's classroom (server-side, not client input)", adopted1.classroomId);

  r = await api(tok2, "POST", "/advisor/subjects", {
    code: "ISVSUBJ2",
    name: "Isolation Subject Two",
    credits: 3,
    semester: 5,
  });
  expect(r.status === 201, "Advisor 02 creates subject -> 201", r.status);
  const subject2Id = (r as any).json.data.id as string;

  r = await api(tok2, "POST", `/advisor/subjects/${subject2Id}/staff`, { staffId: staff1Id });
  expect(r.status === 201, "Advisor 02 maps Advisor 01's adopted staff into their classroom (cross-classroom teaching) -> 201", r.status);
  const adoptedAfterX = await prisma.staff.findUniqueOrThrow({ where: { id: staff1Id }, select: { classroomId: true } });
  expect(adoptedAfterX.classroomId === classroomIV.id, "cross-classroom mapping preserves ownership (classroomId unchanged)", adoptedAfterX.classroomId);

  r = await api(tok1, "GET", "/advisor/staff");
  expect((r as any).json.meta.total === 1 && (r as any).json.data.some((s: any) => s.id === staff1Id), "Advisor 01 assigned list now contains Staff 1", (r as any).json.meta.total);
  r = await api(tok1, "GET", `/advisor/staff/${staff1Id}`);
  expect(r.status === 200, "Advisor 01 reads adopted Staff 1 -> 200", r.status);
  r = await api(tok2, "GET", `/advisor/staff/${staff1Id}`);
  expect(r.status === 403, "Advisor 02 direct read of adopted Staff 1 -> 403", r.status);

  // Advisor 01 can unmap; classroom membership (adoption) persists
  r = await api(tok1, "DELETE", `/advisor/subjects/${subject1Id}/staff/${staff1Id}`);
  expect(r.status === 200, "Advisor 01 unmaps own staff -> 200", r.status);
  r = await api(tok1, "GET", `/advisor/staff/${staff1Id}`);
  expect(r.status === 200, "Staff 1 stays in Advisor 01's classroom after unmap -> 200", r.status);

  // Advisor 01 adopts the department pool staff member via mapping
  r = await api(tok1, "POST", `/advisor/subjects/${subject1Id}/staff`, { staffId: unassigned.id });
  expect(r.status === 201, "Advisor 01 adopts pool staff -> 201", r.status);
  const adoptedPool = await prisma.staff.findUniqueOrThrow({ where: { id: unassigned.id }, select: { classroomId: true } });
  expect(adoptedPool.classroomId === classroomIV.id, "pool staff scoped to Advisor 01's classroom", adoptedPool.classroomId);
  r = await api(tok1, "GET", `/advisor/staff/${unassigned.id}`);
  expect(r.status === 200, "Adopted pool staff now visible to Advisor 01 -> 200", r.status);
  r = await api(tok2, "GET", `/advisor/staff/${unassigned.id}`);
  expect(r.status === 403, "Adopted pool staff still hidden from Advisor 02 direct read -> 403", r.status);
  // Ownership is not transferable, but Advisor 02 may still map the pool staff
  // into their classroom's subjects (cross-classroom teaching).
  r = await api(tok2, "POST", `/advisor/subjects/${subject2Id}/staff`, { staffId: unassigned.id });
  expect(r.status === 201, "Advisor 02 maps pool staff adopted into Advisor 01's classroom -> 201", r.status);
  const poolAfterX = await prisma.staff.findUniqueOrThrow({ where: { id: unassigned.id }, select: { classroomId: true } });
  expect(poolAfterX.classroomId === classroomIV.id, "pool staff ownership stays with Advisor 01 after cross-classroom map", poolAfterX.classroomId);

  // ─── 7. Admin creates Staff 2; adoption remains isolated between advisors ─
  console.log("7. Second advisor's adoption stays isolated");
  const staff2Id = await createStaffAsAdmin(adminTok, deptId, "ISVEMP002", "staff-two");
  expect(typeof staff2Id === "string" && staff2Id.length > 0, "Admin creates Staff 2 -> 201", staff2Id);
  r = await api(tok2, "POST", `/advisor/subjects/${subject2Id}/staff`, { staffId: staff2Id });
  expect(r.status === 201, "Advisor 02 adopts Staff 2 -> 201", r.status);

  r = await api(tok1, "GET", `/advisor/staff/${staff2Id}`);
  expect(r.status === 403, "Advisor 01 cannot read Advisor 02's adopted Staff 2 -> 403", r.status);
  r = await api(tok1, "GET", "/advisor/staff?search=Staff");
  const l1 = (r as any).json.data as Array<{ id: string }>;
  expect(!l1.some((s) => s.id === staff2Id), "Advisor 01 search cannot find Staff 2", l1.length);
  r = await api(tok2, "GET", "/advisor/staff?search=Staff");
  const l2 = (r as any).json.data as Array<{ id: string }>;
  expect((r as any).json.meta.total === 2 && l2.some((s) => s.id === staff1Id) && l2.some((s) => s.id === staff2Id),
    "Advisor 02 assigned = staff teaching in own classroom (own adopted + cross-classroom mapped)",
    (r as any).json.meta.total);

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