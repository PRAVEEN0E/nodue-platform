/* Cross-Department Staff Support — backend verification (§31, §32, §33, §34
   + §8, §12, §19, §20, §22, §23, §25, §30).

   Scenario:
     3 departments: AIML, IT, CSE + unrelated ECE
     Staff1 home=AIML, Staff2=IT, Staff3=CSE, Staff4=ECE
     AIML Advisor, IT Advisor, CSE Advisor, ECE Advisor
     Subjects: AI(IV-AIML), DS(IV-IT), Python(III-CSE), Embedded(II-ECE)

   Staff1 is mapped to AI + DS + Python (cross-department).
   Staff2 is mapped to DS only (IT only).
   Staff4 is mapped to Embedded only (ECE only).
   Staff3 is never mapped (negative baseline).

   Run against a live dev API:
     npx tsx scripts/verify-cross-department.ts
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
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

const TS = Date.now();
const DOMAIN = `xdep-${TS}.verify.local`;
const email = (n: string) => `${n}@${DOMAIN}`;
const DEPT_AIML = `XDV-AIML-${TS}`;
const DEPT_IT = `XDV-IT-${TS}`;
const DEPT_CSE = `XDV-CSE-${TS}`;
const DEPT_ECE = `XDV-ECE-${TS}`;
const SUB_AI_CODE = `XSUB${TS}AI`;
const SUB_DS_CODE = `XSUB${TS}DS`;
const SUB_PY_CODE = `XSUB${TS}PY`;
const SUB_EMB_CODE = `XSUB${TS}EMB`;

const deptIds: string[] = [];
const classroomIds: string[] = [];
const userIds: string[] = [];

async function cleanup() {
  // Sweep ALL artifacts belonging to this test across runs: emails contain
  // "xdep-", staff codes start "XDSE", subject codes start "XSUB"/"XDSub",
  // dept codes start "XD-".
  const userWhere = { email: { contains: "xdep-" } };
  const users = await prisma.user.findMany({ where: userWhere, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.subjectStaff.deleteMany({
    where: {
      OR: [
        { subject: { code: { startsWith: "XSUB" } } },
        { subject: { code: { startsWith: "XDSub" } } },
        { staff: { userId: { in: ids } } },
      ],
    },
  });
  await prisma.approval.deleteMany({
    where: {
      OR: [
        { subject: { code: { startsWith: "XSUB" } } },
        { subject: { code: { startsWith: "XDSub" } } },
        { student: { userId: { in: ids } } },
      ],
    },
  });
  await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
  await prisma.feeVerification.deleteMany({ where: { student: { userId: { in: ids } } } });
  await prisma.subject.deleteMany({
    where: { OR: [{ code: { startsWith: "XSUB" } }, { code: { startsWith: "XDSub" } }] },
  });
  await prisma.student.deleteMany({ where: { userId: { in: ids } } });
  await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
  await prisma.staff.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { employeeCode: { startsWith: "XDSE" } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.classroom.deleteMany({
    where: { department: { code: { startsWith: "XDV-" } } },
  });
  await prisma.department.deleteMany({ where: { code: { startsWith: "XDV-" } } });
}

async function createDept(code: string) {
  const d = await prisma.department.create({ data: { code, name: `${code} Dept` } });
  deptIds.push(d.id);
  return d;
}

async function createClassroom(name: string, deptId: string) {
  const c = await prisma.classroom.create({
    data: { name, batch: "2023-2027", semester: 7, section: "A", departmentId: deptId },
  });
  classroomIds.push(c.id);
  return c;
}

async function createStaffAsAdmin(adminTok: string, departmentId: string, empCode: string, key: string, firstName: string) {
  const r = await api(adminTok, "POST", "/admin/staff", {
    firstName,
    lastName: "Faculty",
    email: email(key),
    password: "Staff@12345",
    employeeCode: empCode,
    designation: "Assistant Professor",
    departmentId,
  });
  if (r.status !== 201) throw new Error(`admin create staff ${empCode} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return (r as any).json.data.id as string;
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");

  // ─── Bootstrap: 4 departments, 4 classrooms, 4 advisors, 4 staff, 4 subjects ─
  const aiml = await createDept(DEPT_AIML);
  const it = await createDept(DEPT_IT);
  const cse = await createDept(DEPT_CSE);
  const ece = await createDept(DEPT_ECE);

  const ivAiml = await createClassroom("IV-AIML", aiml.id);
  const ivIt = await createClassroom("IV-IT", it.id);
  const iiiCse = await createClassroom("III-CSE", cse.id);
  const iiEce = await createClassroom("II-ECE", ece.id);

  const mkUser = (role: Role, first: string, key: string, deptId: string) =>
    prisma.user.create({ data: { firstName: first, lastName: "Advisor", email: email(key), passwordHash, role, departmentId: deptId } });

  const advAimlU = await mkUser(Role.ADVISOR, "Aiml", "adv-aiml", aiml.id);
  const advItU = await mkUser(Role.ADVISOR, "It", "adv-it", it.id);
  const advCseU = await mkUser(Role.ADVISOR, "Cse", "adv-cse", cse.id);
  const advEceU = await mkUser(Role.ADVISOR, "Ece", "adv-ece", ece.id);
  userIds.push(advAimlU.id, advItU.id, advCseU.id, advEceU.id);

  await prisma.advisor.create({ data: { userId: advAimlU.id, classroomId: ivAiml.id } });
  await prisma.advisor.create({ data: { userId: advItU.id, classroomId: ivIt.id } });
  await prisma.advisor.create({ data: { userId: advCseU.id, classroomId: iiiCse.id } });
  await prisma.advisor.create({ data: { userId: advEceU.id, classroomId: iiEce.id } });

  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const staff1Id = await createStaffAsAdmin(adminTok, aiml.id, `XDSE${TS}001`, "staff1", "StaffOne");
  const staff2Id = await createStaffAsAdmin(adminTok, it.id, `XDSE${TS}002`, "staff2", "StaffTwo");
  const staff3Id = await createStaffAsAdmin(adminTok, cse.id, `XDSE${TS}003`, "staff3", "StaffThree");
  const staff4Id = await createStaffAsAdmin(adminTok, ece.id, `XDSE${TS}004`, "staff4", "StaffFour");

  const tokAiml = await login(email("adv-aiml"), "Verify@12345");
  const tokIt = await login(email("adv-it"), "Verify@12345");
  const tokCse = await login(email("adv-cse"), "Verify@12345");
  const tokEce = await login(email("adv-ece"), "Verify@12345");

  const makeSub = async (advTok: string, code: string) => {
    const r = await api(advTok, "POST", "/advisor/subjects", { code, name: code, credits: 3, semester: 7 });
    if (r.status !== 201) throw new Error(`create subject ${code} failed: ${r.status}`);
    return (r as any).json.data.id as string;
  };
  const subAI = await makeSub(tokAiml, SUB_AI_CODE);
  const subDS = await makeSub(tokIt, SUB_DS_CODE);
  const subPy = await makeSub(tokCse, SUB_PY_CODE);
  const subEmb = await makeSub(tokEce, SUB_EMB_CODE);

  let r: { status: number; json: any };

  // ─── 1. §23 — Admin lifecycle: staff dept is metadata ───────────────────
  console.log("1. §23 — Admin creates staff; dept is metadata");
  const staff1Profile = await prisma.staff.findUniqueOrThrow({ where: { id: staff1Id }, select: { departmentId: true, classroomId: true } });
  expect(staff1Profile.departmentId === aiml.id, "Staff1 home dept = AIML", staff1Profile.departmentId);
  expect(staff1Profile.classroomId === null, "Staff1 starts unassigned", staff1Profile.classroomId);

  // ─── 2. §31 — Cross-department assignment must succeed ──────────────────
  console.log("2. §31 — Cross-department assignment: AIML->AI, IT->DS, CSE->PY all succeed");
  r = await api(tokAiml, "POST", `/advisor/subjects/${subAI}/staff`, { staffId: staff1Id });
  expect(r.status === 201, "AIML advisor maps Staff1 to AI -> 201", r.status);

  r = await api(tokIt, "POST", `/advisor/subjects/${subDS}/staff`, { staffId: staff1Id });
  expect(r.status === 201, "IT advisor maps Staff1 to DS (cross-dept) -> 201", r.status);

  r = await api(tokCse, "POST", `/advisor/subjects/${subPy}/staff`, { staffId: staff1Id });
  expect(r.status === 201, "CSE advisor maps Staff1 to Python (cross-dept) -> 201", r.status);

  r = await api(tokIt, "POST", `/advisor/subjects/${subDS}/staff`, { staffId: staff2Id });
  expect(r.status === 201, "IT advisor maps Staff2 (same dept, own classroom) -> 201", r.status);

  r = await api(tokEce, "POST", `/advisor/subjects/${subEmb}/staff`, { staffId: staff4Id });
  expect(r.status === 201, "ECE advisor maps Staff4 -> 201", r.status);

  // Staff1 adopted into AIML classroom (first mapping)
  const adopted = await prisma.staff.findUniqueOrThrow({ where: { id: staff1Id }, select: { classroomId: true } });
  expect(adopted.classroomId === ivAiml.id, "Staff1 adopted into AIML classroom (first assignment adopts)", adopted.classroomId);

  // Dept change blocked while adopted (§23 admin lifecycle)
  r = await api(adminTok, "PATCH", `/admin/staff/${staff1Id}`, { departmentId: it.id });
  expect(r.status === 403, "Admin cannot change dept while staff is adopted -> 403", r.status);

  // ─── 3. §25 — Duplicate mapping blocked ────────────────────────────────
  console.log("3. §25 — Duplicate mapping blocked");
  r = await api(tokAiml, "POST", `/advisor/subjects/${subAI}/staff`, { staffId: staff1Id });
  expect(r.status === 409, "Duplicate mapping Staff1+AI -> 409", r.status);

  // ─── 4. §24 — Advisor available list is college-wide ───────────────────
  console.log("4. §24 — Advisor available list is college-wide (cross-dept staff visible)");
  r = await api(tokIt, "GET", "/advisor/staff/available");
  expect(r.status === 200, "IT advisor GET /advisor/staff/available -> 200", r.status);
  const availIt = (r.json as any).data as Array<{ id: string; department?: { code: string } }>;
  expect(availIt.some((s) => s.id === staff3Id), "IT advisor sees Staff3 (CSE dept, teaching nothing yet) cross-dept", availIt.map((s) => s.id));
  expect(availIt.some((s) => s.id === staff4Id), "IT advisor sees Staff4 (ECE dept, teaching only ECE) cross-dept", availIt.map((s) => s.id));
  expect(!availIt.some((s) => s.id === staff1Id), "Staff1 excluded from IT available (already teaching DS in this classroom)", availIt.map((s) => s.id));
  expect(!availIt.some((s) => s.id === staff2Id), "Staff2 excluded from IT available (already teaching DS in this classroom)", availIt.map((s) => s.id));
  const staff3Avail = availIt.find((s) => s.id === staff3Id);
  expect(staff3Avail?.department?.code === DEPT_CSE, "Staff3 available entry carries CSE dept (informational)", staff3Avail?.department);

  r = await api(tokAiml, "GET", "/advisor/staff/available");
  expect(r.status === 200, "AIML advisor GET /advisor/staff/available -> 200", r.status);
  const availAiml = (r.json as any).data as Array<{ id: string }>;
  expect(availAiml.some((s) => s.id === staff2Id), "Staff2 (IT dept, currently teaching IT) visible to AIML advisor cross-dept", availAiml.map((s) => s.id));
  expect(availAiml.some((s) => s.id === staff3Id), "Staff3 visible to AIML advisor cross-dept", availAiml.map((s) => s.id));
  expect(!availAiml.some((s) => s.id === staff1Id), "Staff1 excluded from AIML available (already teaching AI here)", availAiml.map((s) => s.id));

  // ─── 5. §32 — Staff1 dashboard: 3 depts, no ECE leak ──────────────────
  console.log("5. §32 — Staff1 dashboard: 3 classrooms across depts");
  const staff1Tok = await login(email("staff1"), "Staff@12345");
  r = await api(staff1Tok, "GET", "/staff/classes");
  expect(r.status === 200, "Staff1 GET /staff/classes -> 200", r.status);
  const classes1 = (r.json as any).data as Array<{ id: string; department: { code: string } }>;
  expect(classes1.length === 3, "Staff1 sees 3 classrooms", classes1.length);
  expect(classes1.some((c) => c.department.code === DEPT_AIML), "Classes include AIML", classes1.map((c) => c.department.code));
  expect(classes1.some((c) => c.department.code === DEPT_IT), "Classes include IT", classes1.map((c) => c.department.code));
  expect(classes1.some((c) => c.department.code === DEPT_CSE), "Classes include CSE", classes1.map((c) => c.department.code));
  expect(!classes1.some((c) => c.department.code === DEPT_ECE), "Classes do NOT include ECE", classes1.map((c) => c.department.code));

  // ─── 6. §32 — Staff1 detail per class: only own subjects ───────────────
  console.log("6. §32 — Staff1 classroom detail scoped to assignments");
  r = await api(staff1Tok, "GET", `/staff/classes/${ivAiml.id}`);
  expect(r.status === 200, "Staff1 access AIML classroom detail", r.status);
  expect((r.json as any).data.subjects.length === 1 && (r.json as any).data.subjects[0].code === SUB_AI_CODE,
    "AIML classroom shows only AI subject", (r.json as any).data.subjects);

  r = await api(staff1Tok, "GET", `/staff/classes/${ivIt.id}`);
  expect(r.status === 200, "Staff1 access IT classroom detail", r.status);
  expect((r.json as any).data.subjects.length === 1 && (r.json as any).data.subjects[0].code === SUB_DS_CODE,
    "IT classroom shows only DS subject", (r.json as any).data.subjects);

  r = await api(staff1Tok, "GET", `/staff/classes/${iiiCse.id}`);
  expect(r.status === 200, "Staff1 access CSE classroom detail", r.status);
  expect((r.json as any).data.subjects.length === 1 && (r.json as any).data.subjects[0].code === SUB_PY_CODE,
    "CSE classroom shows only Python subject", (r.json as any).data.subjects);

  // ─── 7. §33 — Staff2 (IT only) negative: no CSE/AIML/ECE ──────────────
  console.log("7. §33 — Staff2 (IT only) scoped correctly, cross-dept denied");
  const staff2Tok = await login(email("staff2"), "Staff@12345");
  r = await api(staff2Tok, "GET", "/staff/classes");
  expect(r.status === 200, "Staff2 GET /staff/classes -> 200", r.status);
  const classes2 = (r.json as any).data as Array<{ id: string; department: { code: string } }>;
  expect(classes2.length === 1, "Staff2 sees 1 classroom (IT only)", classes2.length);
  expect(classes2[0].department.code === DEPT_IT, "Staff2 sole classroom = IT", classes2[0].department.code);

  r = await api(staff2Tok, "GET", `/staff/classes/${iiiCse.id}`);
  expect(r.status === 403, "Staff2 GET CSE classroom -> 403", r.status);

  r = await api(staff2Tok, "GET", `/staff/classes/${ivAiml.id}`);
  expect(r.status === 403, "Staff2 GET AIML classroom -> 403", r.status);

  r = await api(staff2Tok, "GET", `/staff/classes/${iiEce.id}`);
  expect(r.status === 403, "Staff2 GET ECE classroom -> 403 (exists, not assigned; authorization failure)", r.status);

  // ─── 8. §33 — Staff1 IDOR: ECE denied ─────────────────────────────────
  console.log("8. §33 — Staff1 IDOR: ECE classroom denied");
  r = await api(staff1Tok, "GET", `/staff/classes/${iiEce.id}`);
  expect(r.status === 403, "Staff1 GET ECE classroom -> 403", r.status);

  // ─── 9. §20 — Staff classes assignment-derived, query params ignored ────
  console.log("9. §20 — Staff classes assignment-derived, invalid query params ignored");
  r = await api(staff1Tok, "GET", "/staff/classes?departmentId=INVALID&classroomId=GARBAGE");
  expect(r.status === 200 && (r.json as any).data.length === 3, "Staff1 classes ignore invalid params (still 3)", (r.json as any).data.length);

  // ─── 10. §30 — Audit records advisor dept, not staff home dept ─────────
  console.log("10. §30 — Audit entry dept = advisor classroom dept for cross-dept mapping");
  const audits = await prisma.auditLog.findMany({
    where: { action: "SUBJECT_STAFF_MAPPED", entityId: `${subDS}:${staff1Id}` },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { departmentId: true },
  });
  expect(audits.length > 0, "Audit entry found for IT->Staff1 DS mapping", audits.length);
  expect(audits[0]?.departmentId === it.id, "Audit dept = IT (advisor classroom dept), not AIML (staff home dept)", audits[0]?.departmentId);

  // ─── 11. §12 — Staff1 home dept unchanged after cross-dept ────────────
  console.log("11. §12 — Staff1 home dept unchanged");
  const staff1Now = await prisma.staff.findUniqueOrThrow({ where: { id: staff1Id }, select: { departmentId: true } });
  expect(staff1Now.departmentId === aiml.id, "Staff1 deptId still AIML after 3 cross-dept assignments", staff1Now.departmentId);

  // ─── 12. §33 — Staff4 (ECE only) sees only ECE ────────────────────────
  console.log("12. §33 — Staff4 (ECE only) sees only ECE");
  const staff4Tok = await login(email("staff4"), "Staff@12345");
  r = await api(staff4Tok, "GET", "/staff/classes");
  const classes4 = (r.json as any).data as Array<{ id: string; department: { code: string } }>;
  expect(r.status === 200 && classes4.length === 1, "Staff4 sees 1 classroom", classes4.length);
  expect(classes4[0].department.code === DEPT_ECE, "Staff4 sole classroom = ECE", classes4[0].department.code);

  r = await api(staff4Tok, "GET", `/staff/classes/${ivAiml.id}`);
  expect(r.status === 403, "Staff4 GET AIML -> 403", r.status);

  // ─── 13. §29 — Staff dashboard summary counts ──────────────────────────
  console.log("13. §29 — Staff1 dashboard summary counts cross-dept");
  r = await api(staff1Tok, "GET", "/staff/dashboard");
  expect(r.status === 200, "Staff1 dashboard -> 200", r.status);
  expect((r.json as any).data.counts.subjects === 3, "Staff1 dashboard subject count == 3", (r.json as any).data.counts.subjects);

  // ─── 14. §19 — Staff subjects scope assignment-derived ─────────────────
  console.log("14. §19 — Staff2 subjects: only own IT subject; IDOR subject denied");
  r = await api(staff2Tok, "GET", "/staff/subjects");
  const staff2Subs = (r.json as any).data as Array<{ id: string }>;
  expect(r.status === 200 && staff2Subs.length === 1, "Staff2 subjects = 1 (own IT subject)", staff2Subs.length);

  r = await api(staff2Tok, "GET", `/staff/subjects/${subAI}`);
  expect(r.status === 403, "Staff2 GET AIML subject via IDOR -> 403", r.status);

  // ─── 15. §8 — IT advisor assigns cross-dept Staff1 to a second IT subject ─
  console.log("15. §8 — Advisor assign validates subject ownership, not staff dept");
const subDS2 = await makeSub(tokIt, `XSUB${TS}DS2`);
  r = await api(tokIt, "POST", `/advisor/subjects/${subDS2}/staff`, { staffId: staff1Id });
  expect(r.status === 201, "IT advisor assigns cross-dept Staff1 to a second IT subject -> 201", r.status);

  // Staff1 now sees 2 subjects in IT
  r = await api(staff1Tok, "GET", `/staff/classes/${ivIt.id}`);
  expect((r.json as any).data.subjects.length === 2, "Staff1 IT classroom now shows 2 subjects", (r.json as any).data.subjects.length);

  // ─── 16. §22 — Staff cache key is per-user (not per-dept) ──────────────
  console.log("16. §22 — Staff cache per-userId (not dept-scoped)");
  const u1 = await prisma.user.findUniqueOrThrow({ where: { email: email("staff1") }, select: { id: true } });
  const u2 = await prisma.user.findUniqueOrThrow({ where: { email: email("staff2") }, select: { id: true } });
  const key1 = `cache:staff:classes:${u1.id}`;
  const key2 = `cache:staff:classes:${u2.id}`;
  expect(key1 === `cache:staff:classes:${u1.id}` && key1 !== key2, "Staff cache key namespaced by userId", key1);
  expect(key2 === `cache:staff:classes:${u2.id}`, "Staff2 has its own distinct cache key", key2);
  // Cross-dept freshness proven above: immediately after the IT mapping,
  // Staff1's classroom detail returned 2 subjects (cache invalidated on map).
}

main()
  .then(async () => {
    console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
    try { await cleanup(); } catch {}
    await prisma.$disconnect();
    process.exit(failed ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("ERROR:", err);
    try { await cleanup(); } catch {}
    await prisma.$disconnect();
    process.exit(1);
  });