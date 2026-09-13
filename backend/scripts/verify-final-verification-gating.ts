/* Final Verification Gating regression (§22–§24, §11, §16, §21, §26 of the
   "Final Verification Must Respect Pipeline Completion" spec).

   The bug being guarded: Step 5 (Final verification) reported COMPLETE while a
   required previous stage (subject approvals) was incomplete. Root cause was a
   persisted Student.isVerified flag surfaced verbatim by /student/status and
   the advisor final-verification queue, so a stale flag could produce an
   impossible state.

   The engine now re-derives the effective final state from the CURRENT
   approval pipeline (all subjects approved AND advisor AND hod AND fee by
   advisor-or-hod). This script validates:

     s1 partial       1/3 subjects, advisor/hod/fee done, STALE isVerified=true
                      -> NOT_READY everywhere; hidden from advisor queue;
                         after completing subjects via the REAL staff API
                         -> COMPLETE and visible (stale flag has no power).
     s2 complete      all stages done, engine-finalized -> COMPLETE; visible.
     s3 hodfee        all stages done, fee via HOD ONLY -> COMPLETE (§24).
     s4 ready         all stages done but NOT finalized -> READY (eligible).
     s5 nofee         all stages except fee, STALE isVerified=true -> NOT_READY.

   Run: npx tsx scripts/verify-final-verification-gating.ts
   Exits non-zero on failure. Cleans up afterwards. */
import { PrismaClient, Role, ApprovalStatus } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { approvalEngine } from "../src/modules/approval-engine/approval-engine.service";

const BASE = process.env.API_URL || "http://localhost:5000/api/v1";
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

const DOMAIN = `fg-gate-${Date.now().toString(36)}.verify.local`;
const email = (n: string) => `${n}@${DOMAIN}`;
const DEPT_CODE = `FGV-${Date.now().toString(36).slice(-4)}`;
const TAG = Date.now().toString(36);

let deptId = "";
let classroomId = "";
const studentIds: Record<string, string> = {};

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.subjectStaff.deleteMany({
      where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { classroomId } }] },
    });
    await prisma.approval.deleteMany({
      where: { OR: [{ student: { userId: { in: ids } } }, { subject: { classroomId } }] },
    });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.feeVerification.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subject.deleteMany({ where: { classroomId } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { id: classroomId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  if (deptId) await prisma.department.deleteMany({ where: { id: deptId } });
}

async function main() {
  await cleanup();

  const passwordHash = await hashPassword("Verify@12345");
  const dept = await prisma.department.create({
    data: { code: DEPT_CODE, name: "Final Gating Verify" },
  });
  deptId = dept.id;

  const classroom = await prisma.classroom.create({
    data: { name: "IV-AIML (fvg)", batch: "2022-2026", semester: 7, section: "A", departmentId: deptId },
  });
  classroomId = classroom.id;

  const mkUser = (role: Role, first: string, last: string, key: string) =>
    prisma.user.create({
      data: { firstName: first, lastName: last, email: email(key), passwordHash, role, departmentId: deptId },
    });

  const advisorUser = await mkUser(Role.ADVISOR, "Gate", "Advisor", "ad");
  const hodUser = await mkUser(Role.HOD, "Gate", "Hod", "hod");
  const staffUser = await mkUser(Role.STAFF, "Gate", "Staff", "staff");
  await prisma.advisor.create({ data: { userId: advisorUser.id, classroomId } });
  await prisma.staff.create({
    data: { userId: staffUser.id, employeeCode: `FGV-EMP-${TAG}`, departmentId: deptId, designation: "Lecturer", classroomId },
  });

  const subjects: string[] = [];
  for (const code of ["FVA", "FVB", "FVC"]) {
    const s = await prisma.subject.create({
      data: { code: `${code}-${TAG}`, name: `Gating Subject ${code}`, credits: 3, semester: 7, departmentId: deptId, classroomId },
    });
    subjects.push(s.id);
    await prisma.subjectStaff.create({ data: { subjectId: s.id, staffId: (await prisma.staff.findUniqueOrThrow({ where: { userId: staffUser.id }, select: { id: true } })).id } });
  }

  async function mkStudent(key: string, first: string, last: string): Promise<string> {
    const su = await mkUser(Role.STUDENT, first, last, key);
    const st = await prisma.student.create({
      data: {
        userId: su.id,
        registerNumber: `FGV-${first.replace(/\s/g, "").toUpperCase()}-${TAG}`,
        rollNumber: `FGV-R-${key}-${TAG}`,
        classroomId,
        departmentId: deptId,
        admissionYear: 2022,
      },
    });
    studentIds[key] = st.id;
    return st.id;
  }

  async function seedStage(id: string, edges: { subjectsApproved: number[]; feeAdvisor: boolean; feeHod: boolean }) {
    await prisma.approval.create({
      data: { studentId: id, approverRole: Role.ADVISOR, approverUserId: advisorUser.id, subjectId: null, status: ApprovalStatus.APPROVED },
    });
    await prisma.approval.create({
      data: { studentId: id, approverRole: Role.HOD, approverUserId: hodUser.id, subjectId: null, status: ApprovalStatus.APPROVED },
    });
    for (const idx of edges.subjectsApproved) {
      await prisma.approval.create({
        data: { studentId: id, approverRole: Role.STAFF, approverUserId: staffUser.id, subjectId: subjects[idx], status: ApprovalStatus.APPROVED },
      });
    }
    await prisma.feeVerification.create({
      data: { studentId: id, advisorApproved: edges.feeAdvisor, hodApproved: edges.feeHod, advisorById: edges.feeAdvisor ? advisorUser.id : null, hodById: edges.feeHod ? hodUser.id : null },
    });
  }

  // s1 partial: S1 approved, S2/S3 pending; advisor/hod/fee done; STALE isVerified.
  const s1 = await mkStudent("s1", "Partial", "One");
  await seedStage(s1, { subjectsApproved: [0], feeAdvisor: true, feeHod: false });
  await prisma.student.update({ where: { id: s1 }, data: { isVerified: true, verifiedAt: new Date() } });

  // s2 complete: all approved, engine-finalized through the real derivation.
  const s2 = await mkStudent("s2", "Complete", "Two");
  await seedStage(s2, { subjectsApproved: [0, 1, 2], feeAdvisor: true, feeHod: false });
  await approvalEngine.tryFinalizeTx(prisma, s2, advisorUser.id, deptId);

  // s3 hodfee: complete but fee via HOD ONLY (§24 OR rule).
  const s3 = await mkStudent("s3", "HodFee", "Three");
  await seedStage(s3, { subjectsApproved: [0, 1, 2], feeAdvisor: false, feeHod: true });
  await approvalEngine.tryFinalizeTx(prisma, s3, hodUser.id, deptId);

  // s4 ready: complete prerequisites but isVerified NOT set (eligible, not done).
  const s4 = await mkStudent("s4", "Ready", "Four");
  await seedStage(s4, { subjectsApproved: [0, 1, 2], feeAdvisor: true, feeHod: false });

  // s5 nofee: everything except fee; STALE isVerified (invalid combo must hide).
  const s5 = await mkStudent("s5", "NoFee", "Five");
  await seedStage(s5, { subjectsApproved: [0, 1, 2], feeAdvisor: false, feeHod: false });
  await prisma.student.update({ where: { id: s5 }, data: { isVerified: true, verifiedAt: new Date() } });

  const studentTok = (key: string) => login(email(key), "Verify@12345");
  const adTok = await login(email("ad"), "Verify@12345");
  const staffTok = await login(email("staff"), "Verify@12345");

  async function statusOf(key: string): Promise<any> {
    const r = await api(await studentTok(key), "GET", "/student/status");
    if (r.status !== 200) throw new Error(`status for ${key} failed: ${r.status}`);
    return r.json.data;
  }

  async function fvIds(): Promise<string[]> {
    const r = await api(adTok, "GET", "/advisor/final-verification?limit=100");
    return (r.json.data as Array<{ id: string }>).map((x) => x.id);
  }

  // ─── 1. §22 MAIN REGRESSION: 1/3 subjects + all else done + stale flag ───
  console.log("1. [§22] 1/3 subjects -> Final NOT_READY / NOT verified");
  let st = await statusOf("s1");
  expect(st.staffStage.total === 3 && st.staffStage.decided === 1 && st.staffStage.pending === 2, "Step1: 3 subjects, 1 decided, 2 pending", st.staffStage);
  expect(st.advisorStage.decision === "APPROVED" && st.hodStage.decision === "APPROVED", "advisors+hod both approved", st.advisorStage);
  expect(st.feeStage.satisfied === true, "fee verified", st.feeStage);
  expect(st.finalVerification.eligible === false, "final eligible = false (subjects incomplete)", st.finalVerification);
  expect(st.finalVerification.state === "NOT_READY", "final state = NOT_READY (stale isVerified ignored)", st.finalVerification);
  expect(st.finalVerification.verified === false, "final verified = false despite stale isVerified=true", st.finalVerification);

  // Step-1 gating reflected on the snapshot: "approved < total" while decided includes nothing rejected.
  expect(st.staffStage.approved === 1 && st.staffStage.rejected === 0, "Step1 approved=1 rejected=0", st.staffStage);

  // ─── 2. §16 / §26: advisor queue hides the stale/incomplete students ─────
  console.log("2. [§16/§26] Advisor final-verification queue derived-state gating");
  let ids = await fvIds();
  expect(!ids.includes(s1), "s1 (stale, 1/3) NOT in advisor FV queue", ids);
  expect(!ids.includes(s5), "s5 (stale, fee missing) NOT in advisor FV queue", ids);
  expect(!ids.includes(s4), "s4 (eligible but not finalized) NOT in advisor FV queue", ids);
  expect(ids.includes(s2) && ids.includes(s3), "s2 + s3 (genuinely complete) ARE in advisor FV queue", ids);
  expect(ids.length === 2, "queue total == 2 (only genuinely complete)", ids.length);

  // ─── 3. §23 complete case ────────────────────────────────────────────────
  console.log("3. [§23] All prerequisites complete + finalized -> COMPLETE / verified");
  st = await statusOf("s2");
  expect(st.finalVerification.eligible === true, "s2 eligible = true", st.finalVerification);
  expect(st.finalVerification.state === "COMPLETE", "s2 final state = COMPLETE", st.finalVerification);
  expect(st.finalVerification.verified === true, "s2 final verified = true", st.finalVerification);

  // ─── 4. §24 HOD-fee OR rule ──────────────────────────────────────────────
  console.log("4. [§24] Fee verified by HOD only -> COMPLETE");
  st = await statusOf("s3");
  expect(st.feeStage.satisfied === true, "s3 fee satisfied via HOD only", st.feeStage);
  expect(st.finalVerification.state === "COMPLETE" && st.finalVerification.verified === true, "s3 COMPLETE (no advisor fee needed)", st.finalVerification);

  // ─── 5. READY state: eligible but not finalized ──────────────────────────
  console.log("5. [§5] Eligible but NOT finalized -> READY (not yet verified)");
  st = await statusOf("s4");
  expect(st.finalVerification.eligible === true, "s4 eligible = true", st.finalVerification);
  expect(st.finalVerification.state === "READY", "s4 state = READY", st.finalVerification);
  expect(st.finalVerification.verified === false, "s4 verified = false", st.finalVerification);
  // Transition: finalize via the engine => COMPLETE.
  await approvalEngine.tryFinalizeTx(prisma, s4, advisorUser.id, deptId);
  st = await statusOf("s4");
  expect(st.finalVerification.state === "COMPLETE", "s4 finalizes to COMPLETE via engine", st.finalVerification);

  // ─── 6. §19/§11 fee-missing with stale flag ──────────────────────────────
  console.log("6. Fee missing + stale isVerified -> NOT_READY, never verified");
  st = await statusOf("s5");
  expect(st.feeStage.satisfied === false, "s5 fee pending", st.feeStage);
  expect(st.finalVerification.eligible === false, "s5 eligible = false (fee missing)", st.finalVerification);
  expect(st.finalVerification.state === "NOT_READY" && st.finalVerification.verified === false, "s5 NOT_READY despite stale flag", st.finalVerification);

  // ─── 7. §19/§26 advance the pipeline through the REAL staff API ──────────
  console.log("7. Approve remaining subjects via /staff/approvals (real path)");
  const pairFor = (subjIdx: number) => ({ studentId: s1, subjectId: subjects[subjIdx], decision: "APPROVED" as const, remarks: "approve" });
  let r = await api(staffTok, "POST", "/staff/approvals", pairFor(1));
  expect(r.status === 200 || r.status === 201, "staff approves subject 2 -> 200/201", r.status);
  r = await api(staffTok, "POST", "/staff/approvals", pairFor(2));
  expect(r.status === 200 || r.status === 201, "staff approves subject 3 -> 200/201", r.status);
  r = await api(staffTok, "POST", "/staff/approvals", pairFor(1));
  expect(r.status === 200 && (r.json.data as any)?.idempotent === true, "[§21] duplicate subject decision is idempotent", r.json);
  r = await api(staffTok, "POST", "/staff/approvals", pairFor(2));
  expect(r.status === 200 && (r.json.data as any)?.idempotent === true, "[§21] second duplicate idempotent", r.json);

  st = await statusOf("s1");
  expect(st.staffStage.decided === 3 && st.staffStage.pending === 0, "Step1 now all 3 decided", st.staffStage);
  expect(st.finalVerification.eligible === true, "s1 eligible now true", st.finalVerification);
  const stateAfter = st.finalVerification.state;
  const verifiedAfter = st.finalVerification.verified;
  expect(stateAfter === "COMPLETE" && verifiedAfter === true, "s1 finals COMPLETE + verified once prerequisites satisfied (flag became legitimate)", st.finalVerification);

  ids = await fvIds();
  expect(ids.includes(s1) && ids.includes(s2) && ids.includes(s3) && ids.includes(s4), "[§26] completed s1 now SHOWN alongside s2/s3/s4", ids);
  expect(!ids.includes(s5), "s5 still hidden (fee never verified)", ids);
  expect(ids.length === 4, "queue total == 4 after advance", ids.length);

  // ─── 8. Structural invariant: derived complete is always consistent ────────
  console.log("8. No impossible state: the queue never reports an ineligible student as complete");
  const all = await prisma.student.findMany({
    where: { user: { email: { endsWith: `@${DOMAIN}` } } },
    select: {
      id: true,
      isVerified: true,
      classroom: { select: { subjects: { select: { id: true } } } },
      approvals: { select: { approverRole: true, subjectId: true, status: true } },
      feeVerification: { select: { advisorApproved: true, hodApproved: true } },
    },
  });
  const queue = await fvIds();
  for (const s of all) {
    const subjStatus = new Map<string, string>();
    for (const a of s.approvals) if (a.approverRole === Role.STAFF && a.subjectId) subjStatus.set(a.subjectId, a.status);
    const approved = [...subjStatus.values()].filter((v) => v === "APPROVED").length;
    const rejected = [...subjStatus.values()].filter((v) => v === "REJECTED").length;
    const advisorOk = s.approvals.some((a) => a.approverRole === Role.ADVISOR && !a.subjectId && a.status === "APPROVED");
    const hodOk = s.approvals.some((a) => a.approverRole === Role.HOD && !a.subjectId && a.status === "APPROVED");
    const feeOk = (s.feeVerification?.advisorApproved ?? false) || (s.feeVerification?.hodApproved ?? false);
    const eligible = s.classroom.subjects.length > 0 && approved === s.classroom.subjects.length && rejected === 0 && advisorOk && hodOk && feeOk;
    expect(!queue.includes(s.id) || eligible, `FV queue contains only pipeline-complete students (${s.id})`, { approved, total: s.classroom.subjects.length, feeOk, advisorOk, hodOk });
    expect(!s.isVerified || eligible || !queue.includes(s.id), `stale isVerified never surfaces without eligibility (${s.id})`, s.id);
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