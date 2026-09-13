/* Phase 6 verification: Student RBAC, ownership, IDOR, view-only, shapes.
   Run: npx tsx scripts/verify-student-phase6.ts (live dev API).
   Cleans up bootstrap rows afterwards. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const BASE = process.env.STUDENT_API_URL || "http://localhost:5000/api/v1";
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

const TD = "phase6.verify.local";
const email = (n: string) => `${n}@${TD}`;

async function cleanup() {
  // The Phase-6 snapshot relies on FeeStage.satisfied === false; test scripts
  // (verify-fee-verification) leave approved fee-verifications on the real seed
  // student, so reset that state for determinism on every run.
  const adaReal = await prisma.student.findFirst({
    where: { user: { email: "student.cse@institution.edu" } },
    select: { id: true },
  });
  if (adaReal) {
    await prisma.feeVerification.deleteMany({ where: { studentId: adaReal.id } });
  }
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TD}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.approval.deleteMany({
      where: { OR: [{ student: { userId: { in: ids } } }, { subject: { code: { startsWith: "P6" } } }] },
    });
    // Also remove test fees attached to real users (identified by test titles)
    await prisma.fee.deleteMany({
      where: {
        OR: [
          { student: { userId: { in: ids } } },
          { title: { startsWith: "P6" } },
          { title: { startsWith: "Tuition P6" } },
        ],
      },
    });
    await prisma.subjectStaff.deleteMany({ where: { subject: { code: { startsWith: "P6" } } } });
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P6" } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { name: "P6 Isolation" } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } else {
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P6" } } });
    await prisma.classroom.deleteMany({ where: { name: "P6 Isolation" } });
  }
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const ada = await prisma.student.findFirstOrThrow({
    where: { user: { email: "student.cse@institution.edu" } },
    select: { id: true, classroomId: true, registerNumber: true },
  });

  // Second student in another classroom (isolation target)
  const roomX = await prisma.classroom.create({
    data: { name: "P6 Isolation", batch: "2024-2028", semester: 2, section: "Z", departmentId: cse.id },
  });
  const pupilXUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "PupilX", email: email("pupil-x"), passwordHash, role: Role.STUDENT, departmentId: cse.id },
  });
  await prisma.student.create({
    data: { userId: pupilXUser.id, registerNumber: "P6REGX", classroomId: roomX.id, departmentId: cse.id, admissionYear: 2024 },
  });

  // Subject in Ada's classroom + staff decision, plus a real fee record.
  // Phase 6-R: the student must NEVER see fee amounts/balance anywhere —
  // the fee record exists only to prove non-exposure after the Fees section
  // was removed from the Student module.
  const subjectA = await prisma.subject.create({
    data: { code: "P6SUBJA", name: "Phase Six Subject A", credits: 3, semester: 7, departmentId: cse.id, classroomId: ada.classroomId },
  });
  const subjectB = await prisma.subject.create({
    data: { code: "P6SUBJB", name: "Phase Six Subject B", credits: 2, semester: 7, departmentId: cse.id, classroomId: ada.classroomId },
  });
  const staffUser = await prisma.user.findUniqueOrThrow({ where: { email: "staff.cse@institution.edu" } });
  await prisma.approval.create({
    data: { studentId: ada.id, subjectId: subjectA.id, approverRole: Role.STAFF, approverUserId: staffUser.id, status: "APPROVED" },
  });
  await prisma.fee.create({
    data: { studentId: ada.id, title: "Tuition P6", totalAmount: 60000, paidAmount: 20000, status: "PARTIAL" },
  });

  // Foreign-classroom subject (IDOR target)
  const subjectX = await prisma.subject.create({
    data: { code: "P6SUBJX", name: "Phase Six Subject X", credits: 3, semester: 2, departmentId: cse.id, classroomId: roomX.id },
  });

  const studentTok = await login("student.cse@institution.edu", "Student@12345");
  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const staffTok = await login("staff.cse@institution.edu", "Staff@12345");

  // ─── 1. RBAC ──────────────────────────────────────────────────────────
  console.log("1. Role RBAC");
  let r = await api(null, "GET", "/student/dashboard");
  expect(r.status === 401, "unauthenticated -> 401", r.status);
  for (const [tok, role] of [[adminTok, "ADMIN"], [staffTok, "STAFF"]] as const) {
    r = await api(tok, "GET", "/student/dashboard");
    expect(r.status === 403, `${role} -> 403`, r.status);
  }
  r = await api(studentTok, "GET", "/student/dashboard");
  expect(r.status === 200, "STUDENT -> 200", r.status);

  // ─── 2. Shapes + ownership ────────────────────────────────────────────
  console.log("2. Shapes + ownership");
  const dash = r.json.data;
  expect(dash.student?.registerNumber === "927623CSR001", "dashboard is own record", dash.student?.registerNumber);
  expect(
    dash.subjects?.total === 2 && dash.subjects?.approved === 1 && dash.subjects?.pending === 1,
    "dashboard subject counts real",
    dash.subjects
  );
  expect(dash.fees === undefined, "dashboard exposes NO fee summary (amounts removed)", dash.fees);
  expect(
    !JSON.stringify(dash).includes("totalDue") &&
      !JSON.stringify(dash).includes("balance") &&
      !JSON.stringify(dash).includes("totalPaid"),
    "dashboard payload carries no fee money fields",
    Object.keys(dash)
  );

  r = await api(studentTok, "GET", "/student/profile");
  expect(r.status === 200 && r.json.data?.registerNumber === "927623CSR001", "profile is own record");

  r = await api(studentTok, "GET", "/student/subjects");
  const codes = (r.json.data as any[]).map((s) => s.code);
  expect(r.status === 200 && codes.includes("P6SUBJA") && codes.includes("P6SUBJB"), "subjects list own classroom", codes);
  expect(!codes.includes("P6SUBJX"), "foreign subject absent from list");
  const subjA = (r.json.data as any[]).find((s) => s.code === "P6SUBJA");
  expect(subjA?.approvals?.[0]?.status === "APPROVED", "own decision visible");
  const subjB = (r.json.data as any[]).find((s) => s.code === "P6SUBJB");
  expect(subjB?.approvals?.length === 0, "pending has empty approvals");

  r = await api(studentTok, "GET", `/student/subjects/${subjectA.id}`);
  expect(r.status === 200, "own subject detail -> 200", r.status);
  r = await api(studentTok, "GET", `/student/subjects/${subjectX.id}`);
  expect(r.status === 403, "foreign subject detail -> 403", r.status);
  r = await api(studentTok, "GET", "/student/subjects/00000000-0000-4000-8000-000000000000");
  expect(r.status === 404, "missing subject -> 404", r.status);
  r = await api(studentTok, "GET", "/student/subjects/not-a-uuid");
  expect(r.status === 400, "malformed id -> 400", r.status);

  r = await api(studentTok, "GET", "/student/fees");
  expect(
    r.status === 404,
    "GET /student/fees -> 404 (route removed from Student module)",
    r.status
  );

  r = await api(studentTok, "GET", "/student/profile");
  expect(r.status === 200 && r.json.data?.registerNumber === "927623CSR001", "profile is own record");
  expect(
    !JSON.stringify(r.json.data).includes("totalAmount") && !JSON.stringify(r.json.data).includes("paidAmount"),
    "profile payload carries no fee amounts"
  );

  r = await api(studentTok, "GET", "/student/status");
  const st = r.json.data;
  expect(
    r.status === 200 &&
      st.staffStage?.total === 2 &&
      st.staffStage?.decided === 1 &&
      st.advisorStage?.decision === "PENDING" &&
      st.hodStage?.decision === "PENDING" &&
      st.feeStage?.satisfied === false &&
      st.finalVerification?.verified === false,
    "status snapshot honest (no faked stages)",
    { staff: st.staffStage, adv: st.advisorStage, hod: st.hodStage, fee: st.feeStage, fin: st.finalVerification }
  );
  expect(
    st.feeStage !== undefined &&
      !JSON.stringify(st).includes("totalAmount") &&
      !JSON.stringify(st).includes("balance") &&
      !JSON.stringify(st).includes("totalPaid"),
    "status keeps fee verification state only (no money fields)"
  );

  // ─── 3. View-only: every mutation shape must fail closed ──────────────
  console.log("3. View-only enforcement");
  const mutations: Array<[string, string, unknown?]> = [
    ["POST", "/student/subjects", {}],
    ["POST", "/student/profile", {}],
    ["POST", "/student/fees", {}],
    ["POST", "/student/dashboard", {}],
    ["PATCH", "/student/profile", { firstName: "Hax" }],
    ["PATCH", `/student/subjects/${subjectA.id}`, { name: "Hax" }],
    ["PATCH", "/student/fees", { status: "PAID" }],
    ["PUT", "/student/profile", {}],
    ["DELETE", "/student/profile"],
    ["DELETE", `/student/subjects/${subjectA.id}`],
  ];
  for (const [m, p, b] of mutations) {
    r = await api(studentTok, m, p, b);
    expect(r.status === 404, `${m} ${p} -> 404 (no mutation route)`, r.status);
  }

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
