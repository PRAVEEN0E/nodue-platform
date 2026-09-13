/* Staff Multi-Class / Multi-Subject verification — end-to-end backend checks
   for the teaching-scope model:

   • A staff member's teaching scope = the DISTINCT classrooms of the subjects
     they are mapped to (SubjectStaff), NOT Staff.classroomId (which is
     ownership/adoption metadata only, set once by the mapping advisor).
   • Advisors map staff into their classroom's subjects; a staff member can be
     mapped into MULTIPLE classrooms/subjects (cross-classroom teaching).
   • Staff "My Classes" lists exactly the assigned classrooms; classroom detail
     lists exactly their assigned subjects in it; subject detail lists exactly
     that classroom's students; approvals are SUBJECT-LEVEL (approving one
     subject never touches another).
   • Every scope check derives from the session; IDOR probes (foreign
     classroom/subject/student/department) are rejected with 403 (exists-out)
     vs 404 (missing).

   Scenario (mirrors project §29 test data):
     Staff 01 → IV-MC {AI, ML} + III-MC {AI, Data Science}
     Staff 02 → IV-MC {Data Science}
     Staff 01 must NOT see IV-MC → Data Science.

   Run against a live dev API:
     npx tsx scripts/verify-staff-multiclass.ts
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

const T = String(Date.now()).slice(-6);
const DEPT = `MCC${T}`;
const DEPT_B = `MCB${T}`;
const DOMAIN = `mc-${T}.verify.local`;
const email = (n: string) => `${n}@${DOMAIN}`;
const code = (s: string) => `MC${T}-${s}`;
const reg = (s: string) => `MCR${T}-${s}`;

const classrooms: string[] = [];

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
  await prisma.department.deleteMany({ where: { code: { in: [DEPT, DEPT_B] } } });
}

async function createStaffAsAdmin(adminTok: string, departmentId: string, employeeCode: string, key: string) {
  const r = await api(adminTok, "POST", "/admin/staff", {
    firstName: key.includes("01") ? "Staff" : "Staff",
    lastName: key,
    email: email(key),
    password: "Staff@12345",
    employeeCode,
    designation: "Assistant Professor",
    departmentId,
  });
  if (r.status !== 201) throw new Error(`admin create staff ${employeeCode} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.data.id as string;
}

async function createSubject(advisorTok: string, subjCode: string, name: string, semester: number) {
  const r = await api(advisorTok, "POST", "/advisor/subjects", { code: subjCode, name, credits: 3, semester });
  if (r.status !== 201) throw new Error(`advisor create subject ${subjCode} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.data.id as string;
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");

  // ─── Bootstrap (§29 scenario) ─────────────────────────────────────────
  const dept = await prisma.department.create({ data: { code: DEPT, name: `MultiClass ${T}` } });
  const deptB = await prisma.department.create({ data: { code: DEPT_B, name: `MultiClass-B ${T}` } });

  const iv = await prisma.classroom.create({
    data: { name: `IV-MC (${T})`, batch: "2022-2026", semester: 7, section: "A", departmentId: dept.id },
  });
  const iii = await prisma.classroom.create({
    data: { name: `III-MC (${T})`, batch: "2023-2027", semester: 5, section: "A", departmentId: dept.id },
  });
  const xr = await prisma.classroom.create({
    data: { name: `X-MCB (${T})`, batch: "2022-2026", semester: 7, section: "A", departmentId: deptB.id },
  });
  classrooms.push(iv.id, iii.id, xr.id);

  const mkUser = (role: Role, first: string, last: string, key: string, departmentId: string) =>
    prisma.user.create({ data: { firstName: first, lastName: last, email: email(key), passwordHash, role, departmentId } });

  const advIvUser = await mkUser(Role.ADVISOR, "Advisor", "IV", "advisor-iv", dept.id);
  const advIiiUser = await mkUser(Role.ADVISOR, "Advisor", "III", "advisor-iii", dept.id);
  await prisma.advisor.create({ data: { userId: advIvUser.id, classroomId: iv.id } });
  await prisma.advisor.create({ data: { userId: advIiiUser.id, classroomId: iii.id } });

  const mkStudent = async (first: string, key: string, cls: string, regNo: string) => {
    const u = await mkUser(Role.STUDENT, first, key, key, dept.id);
    return prisma.student.create({
      data: { userId: u.id, registerNumber: regNo, rollNumber: regNo, classroomId: cls, departmentId: dept.id, admissionYear: 2022 },
    });
  };
  const [iv1, iv2, iv3] = await Promise.all([
    mkStudent("Aarav", "iv1", iv.id, reg("IV001")),
    mkStudent("Bhavya", "iv2", iv.id, reg("IV002")),
    mkStudent("Charan", "iv3", iv.id, reg("IV003")),
  ]);
  const [iii1, iii2] = await Promise.all([
    mkStudent("Disha", "iii1", iii.id, reg("III001")),
    mkStudent("Esha", "iii2", iii.id, reg("III002")),
  ]);
  const xUser = await mkUser(Role.STUDENT, "Foreign", "X", "x1", deptB.id);
  const xStudent = await prisma.student.create({
    data: { userId: xUser.id, registerNumber: reg("X001"), rollNumber: reg("X001"), classroomId: xr.id, departmentId: deptB.id, admissionYear: 2022 },
  });

  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const tokIv = await login(email("advisor-iv"), "Verify@12345");
  const tokIii = await login(email("advisor-iii"), "Verify@12345");

  const staff01Id = await createStaffAsAdmin(adminTok, dept.id, `MCE${T}001`, "staff-01");
  const staff02Id = await createStaffAsAdmin(adminTok, dept.id, `MCE${T}002`, "staff-02");
  const tok01 = await login(email("staff-01"), "Staff@12345");
  const tok02 = await login(email("staff-02"), "Staff@12345");

  // Subjects (advisor creates inside its own classroom)
  const aiIv = await createSubject(tokIv, code("AI"), `AI in IV-MC (${T})`, 7);
  const mlIv = await createSubject(tokIv, code("ML"), `Machine Learning in IV-MC (${T})`, 7);
  const dsIv = await createSubject(tokIv, code("DS"), `Data Science in IV-MC (${T})`, 7);
  const aiIii = await createSubject(tokIii, code("AI3"), `AI in III-MC (${T})`, 5);
  const dsIii = await createSubject(tokIii, code("DS3"), `Data Science in III-MC (${T})`, 5);

  // Mappings (§29)
  const mapStaff = async (advisorTok: string, subjectId: string, staffId: string) => {
    const r = await api(advisorTok, "POST", `/advisor/subjects/${subjectId}/staff`, { staffId });
    if (r.status !== 201) throw new Error(`map staff ${staffId} -> ${subjectId} failed: ${r.status} ${JSON.stringify(r.json)}`);
  };
  await mapStaff(tokIv, aiIv, staff01Id);
  await mapStaff(tokIv, mlIv, staff01Id);
  await mapStaff(tokIv, dsIv, staff02Id);
  await mapStaff(tokIii, aiIii, staff01Id);
  await mapStaff(tokIii, dsIii, staff01Id);

  let r: { status: number; json: any };

  // ─── 1. My Classes (assigned classrooms, teaching scope) ────────────────
  console.log("1. My Classes / Dashboard (teaching scope)");

  r = await api(tok01, "GET", "/staff/dashboard");
  const d1 = r.json.data.counts;
  expect(
    r.status === 200 && d1.subjects === 4 && d1.students === 5 && d1.pending === 10 && d1.approved === 0 && d1.rejected === 0,
    "M1 staff01 dashboard: 4 subjects, 5 students, 10 pending, 0 decided",
    d1
  );

  r = await api(tok01, "GET", "/staff/classes");
  expect(r.status === 200 && r.json.meta.total === 2, "M2 staff01 My Classes = 2 classrooms", r.json.meta);
  const c1 = r.json.data as Array<any>;
  const ivClass = c1.find((c: any) => c.id === iv.id);
  const iiiClass = c1.find((c: any) => c.id === iii.id);
  expect(
    !!ivClass && ivClass.studentCount === 3 && ivClass.subjectCount === 2 && ivClass.pendingCount === 6,
    "M3 staff01 IV-MC: 3 students, 2 subjects (AI,ML), 6 pending (Data Science invisible)",
    ivClass
  );
  expect(
    !!iiiClass && iiiClass.studentCount === 2 && iiiClass.subjectCount === 2 && iiiClass.pendingCount === 4,
    "M4 staff01 III-MC: 2 students, 2 subjects, 4 pending",
    iiiClass
  );

  r = await api(tok02, "GET", "/staff/classes");
  expect(r.status === 200 && r.json.meta.total === 1, "M5 staff02 My Classes = 1 classroom only", r.json.meta);
  const c2 = r.json.data as Array<any>;
  expect(
    c2.length === 1 && c2[0].id === iv.id && c2[0].subjectCount === 1 && c2[0].pendingCount === 3,
    "M6 staff02 IV-MC: 1 subject (Data Science), 3 pending",
    c2[0]
  );

  // ─── 2. Classroom detail (assigned subjects only) ────────────────────────
  console.log("2. Classroom detail");

  r = await api(tok01, "GET", `/staff/classes/${iv.id}`);
  const ivDetail = r.json.data;
  expect(
    r.status === 200 && ivDetail.subjects.length === 2 && ivDetail.subjects.every((s: any) => [aiIv, mlIv].includes(s.id)),
    "M7 staff01 IV-MC detail lists ONLY AI + ML (not Data Science)",
    ivDetail.subjects?.map((s: any) => s.code)
  );
  expect(
    ivDetail.studentCount === 3 && ivDetail.subjects.every((s: any) => s.pendingCount === 3),
    "M8 IV-MC detail: 3 students, each subject pending 3",
    ivDetail.studentCount
  );

  r = await api(tok01, "GET", `/staff/classes/${iii.id}`);
  const iiiDetail = r.json.data;
  expect(
    r.status === 200 && iiiDetail.subjects.length === 2 && iiiDetail.studentCount === 2,
    "M9 staff01 III-MC detail lists AI + Data Science (2 students)",
    iiiDetail.subjects?.map((s: any) => s.code)
  );

  r = await api(tok02, "GET", `/staff/classes/${iv.id}`);
  const ivDetail2 = r.json.data;
  expect(
    r.status === 200 && ivDetail2.subjects.length === 1 && ivDetail2.subjects[0].id === dsIv,
    "M10 staff02 IV-MC detail lists ONLY Data Science",
    ivDetail2.subjects?.map((s: any) => s.code)
  );

  // ─── 3. IDOR / scope isolation ───────────────────────────────────────────
  console.log("3. Scope isolation (IDOR)");

  r = await api(tok01, "GET", `/staff/classes/${xr.id}`);
  expect(r.status === 403, "M11 other-department classroom outside scope -> 403", r.status);
  r = await api(tok01, "GET", "/staff/classes/00000000-0000-4000-8000-000000000000");
  expect(r.status === 404, "M12 nonexistent classroom -> 404", r.status);
  r = await api(tok01, "GET", `/staff/classes/${iii.id}`, );
  expect(r.status === 200, "M13 staff01 sees own III-MC classroom -> 200", r.status);
  r = await api(tok02, "GET", `/staff/classes/${iii.id}`);
  expect(r.status === 403, "M14 staff02 (IV only) cannot reach III-MC -> 403", r.status);

  r = await api(tok01, "GET", `/staff/subjects/${dsIv}`);
  expect(r.status === 403, "M15 staff01 cannot read staff02's Data Science subject -> 403", r.status);
  r = await api(tok02, "GET", `/staff/subjects/${aiIv}`);
  expect(r.status === 403, "M16 staff02 cannot read staff01's AI subject -> 403", r.status);

  r = await api(tok01, "GET", `/staff/students/${xStudent.id}`);
  expect(r.status === 403, "M17 other-department student outside scope -> 403", r.status);
  r = await api(tok01, "GET", `/staff/students/${iv2.id}`);
  expect(r.status === 200, "M18 staff01 reads own-scope IV student -> 200", r.status);
  r = await api(tok02, "GET", `/staff/students/${iii1.id}`);
  expect(r.status === 403, "M19 staff02 (IV only) cannot read III student -> 403", r.status);
  r = await api(tok02, "GET", "/staff/students/00000000-0000-4000-8000-000000000000");
  expect(r.status === 404, "M20 nonexistent student -> 404", r.status);

  // ─── 4. Assigned subjects (flat + filtered) ──────────────────────────────
  console.log("4. Assigned subjects");

  r = await api(tok01, "GET", "/staff/subjects");
  const s1List = r.json.data as Array<any>;
  const s1Ids = s1List.map((s: any) => s.id);
  expect(
    r.status === 200 && r.json.meta.total === 4 &&
      [aiIv, mlIv, aiIii, dsIii].every((id) => s1Ids.includes(id)) && !s1Ids.includes(dsIv),
    "M21 staff01 subjects = AI,ML,AI(III),DS(III); Data Science (IV) absent",
    s1List.map((s: any) => s.code)
  );
  r = await api(tok01, "GET", "/staff/subjects?semester=7");
  expect(r.status === 200 && r.json.meta.total === 2, "M22 semester filter (7) -> 2 subjects", r.json.meta);
  r = await api(tok01, "GET", "/staff/subjects?semester=5");
  expect(r.status === 200 && r.json.meta.total === 2, "M23 semester filter (5) -> 2 subjects", r.json.meta);
  r = await api(tok01, "GET", "/staff/subjects?search=AI");
  expect(r.status === 200 && r.json.meta.total === 2, "M24 search 'AI' -> AI + AI(III) only", r.json.meta);

  r = await api(tok01, "GET", `/staff/subjects/${aiIv}`);
  const aiDetail = r.json.data;
  expect(
    r.status === 200 && aiDetail.students.length === 3 &&
      aiDetail.students.every((st: any) => st.registerNumber.startsWith(reg("IV"))),
    "M25 staff01 AI subject detail -> exactly the 3 IV students",
    aiDetail.students?.map((s: any) => s.registerNumber)
  );
  r = await api(tok01, "GET", `/staff/subjects/${aiIii}`);
  expect(
    r.status === 200 && r.json.data.students.length === 2 &&
      r.json.data.students.every((st: any) => st.registerNumber.startsWith(reg("III"))),
    "M26 staff01 AI(III) subject detail -> exactly the 2 III students",
    r.json.data.students?.map((s: any) => s.registerNumber)
  );

  // ─── 5. Scoped students (grouped view data) ──────────────────────────────
  console.log("5. Students");

  r = await api(tok01, "GET", "/staff/students");
  const rows1 = r.json.data as Array<any>;
  expect(r.status === 200 && r.json.meta.total === 5, "M27 staff01 student scope = 5 (IV 3 + III 2)", r.json.meta);
  const iv1Row = rows1.find((s: any) => s.registerNumber === reg("IV001"));
  expect(iv1Row && iv1Row.staffDecisions.total === 2, "M28 IV students carry 2 subject decisions (AI,ML)", iv1Row?.staffDecisions);
  const iii1Row = rows1.find((s: any) => s.registerNumber === reg("III001"));
  expect(iii1Row && iii1Row.staffDecisions.total === 2, "M29 III students carry 2 subject decisions", iii1Row?.staffDecisions);
  expect(!rows1.some((s: any) => s.registerNumber.startsWith(reg("X"))), "M30 no outside-dept student in scope", rows1.map((s: any) => s.registerNumber));

  r = await api(tok01, "GET", `/staff/students?subjectId=${aiIv}`);
  const aiRows = r.json.data as Array<any>;
  expect(r.status === 200 && r.json.meta.total === 3 && aiRows.every((s: any) => s.classroom.id === iv.id), "M31 subjectId=AI narrows to 3 IV students", r.json.meta);
  r = await api(tok01, "GET", `/staff/students?subjectId=${aiIii}`);
  const ai3Rows = r.json.data as Array<any>;
  expect(r.status === 200 && r.json.meta.total === 2 && ai3Rows.every((s: any) => s.classroom.id === iii.id), "M32 subjectId=AI(III) narrows to 2 III students", r.json.meta);
  r = await api(tok01, "GET", "/staff/students?search=IV001");
  expect(r.status === 200 && r.json.meta.total === 1, "M33 search 'IV001' -> 1", r.json.meta);
  r = await api(tok02, "GET", `/staff/students?subjectId=${aiIv}`);
  expect(r.status === 403, "M34 staff02 subjectId=AI -> 403 (not assigned)", r.status);
  r = await api(tok01, "GET", `/staff/students?subjectId=${dsIv}`);
  expect(r.status === 403, "M35 staff01 subjectId=DS -> 403 (not assigned)", r.status);

  // ─── 6. Subject-level approval isolation ─────────────────────────────────
  console.log("6. Approval engine (subject-level)");

  r = await api(tok01, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: aiIv, decision: "APPROVED" });
  expect(r.status === 201, "M36 staff01 approves IV001 in AI -> 201", r.status);

  r = await api(tok01, "GET", `/staff/subjects/${aiIv}`);
  const aiAfter = r.json.data.students;
  const iv1Ai = aiAfter.find((s: any) => s.id === iv1.id);
  expect(iv1Ai && iv1Ai.approvals[0]?.status === "APPROVED", "M37 AI subject: IV001 now APPROVED", iv1Ai?.approvals);
  expect(aiAfter.filter((s: any) => s.id !== iv1.id).every((s: any) => s.approvals.length === 0), "M38 AI subject: other students still pending", aiAfter.map((s: any) => ({ reg: s.registerNumber, n: s.approvals.length })));

  r = await api(tok01, "GET", `/staff/subjects/${mlIv}`);
  const mlAfter = r.json.data.students;
  expect(mlAfter.every((s: any) => s.approvals.length === 0), "M39 ML subject untouched by AI decision (subject-level isolation)", mlAfter.map((s: any) => ({ reg: s.registerNumber, n: s.approvals.length })));

  r = await api(tok01, "GET", "/staff/approvals?status=pending");
  expect(r.status === 200 && r.json.meta.total === 9, "M40 pending pairs 10 -> 9 after one approval", r.json.meta);

  r = await api(tok01, "GET", "/staff/dashboard");
  const d2 = r.json.data.counts;
  expect(d2.pending === 9 && d2.approved === 1, "M41 dashboard reflects approval (cache invalidated)", d2);

  r = await api(tok01, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: aiIv, decision: "APPROVED" });
  expect(r.status === 200, "M42 idempotent re-approve -> 200", r.status);
  r = await api(tok01, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: aiIv, decision: "REJECTED", remarks: "changed mind" });
  expect(r.status === 409, "M43 different decision on decided pair -> 409", r.status);

  r = await api(tok01, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: mlIv, decision: "REJECTED" });
  expect(r.status === 400, "M44 reject without remarks -> 400", r.status);
  r = await api(tok01, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: mlIv, decision: "REJECTED", remarks: "failed internal viva" });
  expect(r.status === 201, "M45 reject with remarks -> 201", r.status);

  r = await api(tok01, "POST", "/staff/approvals", { studentId: iii1.id, subjectId: aiIv, decision: "APPROVED" });
  expect(r.status === 403, "M46 student(s) != subject classroom mismatch -> 403", r.status);
  r = await api(tok01, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: dsIv, decision: "APPROVED" });
  expect(r.status === 403, "M47 staff01 cannot decide staff02's subject (IV DS) -> 403", r.status);
  r = await api(tok02, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: aiIv, decision: "APPROVED" });
  expect(r.status === 403, "M48 staff02 cannot decide AI (only Data Science) -> 403", r.status);

  r = await api(tok02, "POST", "/staff/approvals", { studentId: iv1.id, subjectId: dsIv, decision: "APPROVED" });
  expect(r.status === 201, "M49 staff02 approves IV001 in Data Science -> 201", r.status);
  r = await api(tok02, "GET", "/staff/dashboard");
  const d3 = r.json.data.counts;
  expect(d3.subjects === 1 && d3.students === 3 && d3.pending === 2 && d3.approved === 1, "M50 staff02 dashboard: DS pending 2 after own decision", d3);

  r = await api(tok01, "GET", "/staff/dashboard");
  const d4 = r.json.data.counts;
  expect(d4.pending === 8 && d4.approved === 1 && d4.rejected === 1, "M51 staff01 dashboard: 8 pending (DS not counted)", d4);

  r = await api(tok01, "GET", "/staff/approvals?status=decided");
  const decided = r.json.data as Array<any>;
  expect(
    r.status === 200 && decided.length === 2 &&
      decided.some((p: any) => p.status === "APPROVED" && p.subject.id === aiIv) &&
      decided.some((p: any) => p.status === "REJECTED" && p.subject.id === mlIv),
    "M52 staff01 decided list = AI-approved + ML-rejected for IV001",
    decided.map((p: any) => ({ subj: p.subject?.id, status: p.status }))
  );

  // ─── 7. Staff-scoped cache invalidation on advisor map/unmap ─────────────
  console.log("7. Cache invalidation (map/unmap)");

  const mlIii = await createSubject(tokIii, code("ML3"), `Machine Learning in III-MC (${T})`, 5);
  r = await api(tokIv, "DELETE", `/advisor/subjects/${dsIv}/staff/${staff01Id}`);
  expect(r.status === 404, "M53 staff01 was never mapped to DS (404 confirms scope)", r.status);

  await mapStaff(tokIii, mlIii, staff01Id);
  r = await api(tok01, "GET", "/staff/classes");
  const iiiAfterMap = (r.json.data as Array<any>).find((c: any) => c.id === iii.id);
  expect(
    r.status === 200 && iiiAfterMap && iiiAfterMap.subjectCount === 3 && iiiAfterMap.pendingCount === 6,
    "M54 advisor maps new subject -> III-MC subjectCount 3, pending 6 (cache invalidated)",
    iiiAfterMap
  );
  r = await api(tok01, "GET", "/staff/dashboard");
  expect(r.json.data.counts.subjects === 5 && r.json.data.counts.pending === 10, "M55 staff01 dashboard reflects new subject (5 subjects / 10 pending)", r.json.data.counts);

  await api(tokIii, "DELETE", `/advisor/subjects/${mlIii}/staff/${staff01Id}`);
  r = await api(tok01, "GET", "/staff/classes");
  const iiiAfterUnmap = (r.json.data as Array<any>).find((c: any) => c.id === iii.id);
  expect(
    r.status === 200 && iiiAfterUnmap && iiiAfterUnmap.subjectCount === 2 && iiiAfterUnmap.pendingCount === 4,
    "M56 advisor unmaps subject -> III-MC back to 2 subjects / 4 pending (cache invalidated)",
    iiiAfterUnmap
  );
  r = await api(tok01, "GET", "/staff/dashboard");
  expect(r.json.data.counts.subjects === 4 && r.json.data.counts.pending === 8, "M57 staff01 dashboard back to 4 subjects / 8 pending", r.json.data.counts);

  // ─── 8. Audit trail ──────────────────────────────────────────────────────
  console.log("8. Audit trail");

  r = await api(adminTok, "GET", `/admin/audit-logs?action=SUBJECT_STAFF_MAPPED`);
  const mapped = r.json.data as Array<{ actorUser: { role: string } | null; department: { code: string } | null }>;
  expect(
    r.status === 200 &&
      mapped.some((l) => l.actorUser?.role === "ADVISOR" && l.department?.code === DEPT),
    "M58 SUBJECT_STAFF_MAPPED logged with ADVISOR actor for this department",
    mapped.length
  );

  await cleanup();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await prisma.$disconnect();
});