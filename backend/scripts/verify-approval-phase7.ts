/* Phase 7 verification: full approval engine (Tests A-I), concurrency,
   idempotency, audit, DB integrity. Run against live dev API:
     npx tsx scripts/verify-approval-phase7.ts
   Cleans up all bootstrap rows afterwards. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const BASE = process.env.APPROVAL_API_URL || "http://localhost:5000/api/v1";
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

const TD = "phase7.verify.local";
const email = (n: string) => `${n}@${TD}`;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TD}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.approval.deleteMany({
      where: { OR: [{ approverUserId: { in: ids } }, { student: { userId: { in: ids } } }, { subject: { code: { startsWith: "P7" } } }] },
    });
    await prisma.fee.deleteMany({ where: { student: { userId: { in: ids } } } });
    await prisma.subjectStaff.deleteMany({
      where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { code: { startsWith: "P7" } } }] },
    });
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P7" } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { name: { startsWith: "P7" } } });
    // release ECE HOD slot if we occupied it
    const eceHod = await prisma.user.findFirst({ where: { email: email("hod-ece") } });
    if (eceHod) {
      await prisma.department.updateMany({ where: { hodUserId: eceHod.id }, data: { hodUserId: null } });
    }
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } else {
    await prisma.subject.deleteMany({ where: { code: { startsWith: "P7" } } });
    await prisma.classroom.deleteMany({ where: { name: { startsWith: "P7" } } });
  }
}

async function mkUser(first: string, last: string, em: string, role: Role, deptId: string, hash: string) {
  return prisma.user.create({
    data: { firstName: first, lastName: last, email: em, passwordHash: hash, role, departmentId: deptId },
  });
}

async function main() {
  await cleanup();

  const hash = await hashPassword("Verify@12345");
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const ece = await prisma.department.findUniqueOrThrow({ where: { code: "ECE" } });
  const staffUser = await prisma.user.findUniqueOrThrow({ where: { email: "staff.cse@institution.edu" } });
  const staffProfile = await prisma.staff.findUniqueOrThrow({ where: { userId: staffUser.id } });

  // Classroom P7A + 5 subjects mapped to staff.cse
  const roomA = await prisma.classroom.create({
    data: { name: "P7A", batch: "2024-2028", semester: 7, section: "A", departmentId: cse.id },
  });
  const subjects: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const s = await prisma.subject.create({
      data: { code: `P7S${i}`, name: `Phase Seven Subject ${i}`, credits: 3, semester: 7, departmentId: cse.id, classroomId: roomA.id },
    });
    subjects.push(s.id);
    await prisma.subjectStaff.create({ data: { subjectId: s.id, staffId: staffProfile.id } });
  }

  // Advisor B for P7A
  const advisorBUser = await mkUser("Phase", "AdvisorB", email("advisor-b"), Role.ADVISOR, cse.id, hash);
  await prisma.advisor.create({ data: { userId: advisorBUser.id, classroomId: roomA.id } });

  // HOD for ECE (cross-department negative tests)
  const hodEceUser = await mkUser("Phase", "HodEce", email("hod-ece"), Role.HOD, ece.id, hash);
  await prisma.department.update({ where: { id: ece.id }, data: { hodUserId: hodEceUser.id } });

  // Second staff (cross-staff negative tests)
  const staffBUser = await mkUser("Phase", "TutorB", email("staff-b"), Role.STAFF, cse.id, hash);
  await prisma.staff.create({
    data: { userId: staffBUser.id, employeeCode: "P7EMPB", departmentId: cse.id, designation: "Lecturer" },
  });

  // Students 1..5 in P7A (+ fees where needed)
  async function mkStudent(tag: string, withFee: boolean) {
    const u = await mkUser("Phase", `Pupil${tag}`, email(`pupil-${tag}`), Role.STUDENT, cse.id, hash);
    const s = await prisma.student.create({
      data: { userId: u.id, registerNumber: `P7REG${tag}`, classroomId: roomA.id, departmentId: cse.id, admissionYear: 2024 },
    });
    let feeId: string | null = null;
    if (withFee) {
      const f = await prisma.fee.create({
        data: { studentId: s.id, title: `Tuition ${tag}`, totalAmount: 50000, paidAmount: 0, status: "PENDING" },
      });
      feeId = f.id;
    }
    return { userId: u.id, studentId: s.id, feeId };
  }

  const st1 = await mkStudent("one", true);
  const st2 = await mkStudent("two", false);
  const st3 = await mkStudent("three", false);
  const st4 = await mkStudent("four", true);
  const st5 = await mkStudent("five", false);
  // second fee for student 4 (fee OR scenarios)
  await prisma.fee.create({
    data: { studentId: st4.studentId, title: "Tuition four-b", totalAmount: 30000, paidAmount: 0, status: "PENDING" },
  });

  const staffTok = await login("staff.cse@institution.edu", "Staff@12345");
  const advisorTok = await login(email("advisor-b"), "Verify@12345");
  const hodTok = await login("hod.cse@institution.edu", "Hod@12345");
  const hodEceTok = await login(email("hod-ece"), "Verify@12345");
  const staffBTok = await login(email("staff-b"), "Verify@12345");
  const studentTok = await login(email("pupil-one"), "Verify@12345");

  async function staffDecide(studentId: string, subjectId: string, decision: "APPROVED" | "REJECTED", tok = staffTok, remarks?: string) {
    return api(tok, "POST", "/staff/approvals", { studentId, subjectId, decision, ...(remarks ? { remarks } : {}) });
  }

  // ─── Test A: happy path, 5 subjects ───────────────────────────────────
  console.log("Test A: happy path (5 subjects)");
  for (const sid of subjects) {
    const r = await staffDecide(st1.studentId, sid, "APPROVED");
    expect(r.status === 201, `staff approve subject -> 201`, r.status);
  }
  let r = await api(advisorTok, "GET", "/advisor/approvals?status=pending");
  expect(r.status === 200 && r.json.data.some((x: any) => x.student?.id === st1.studentId), "advisor queue contains student");
  r = await api(advisorTok, "POST", "/advisor/approvals", { studentId: st1.studentId, decision: "APPROVED" });
  expect(r.status === 201, "advisor approve -> 201", r.status);
  r = await api(hodTok, "GET", "/hod/approvals?status=pending");
  expect(r.status === 200 && r.json.data.some((x: any) => x.student?.id === st1.studentId), "HOD queue contains student");
  r = await api(hodTok, "POST", "/hod/approvals", { studentId: st1.studentId, decision: "APPROVED" });
  expect(r.status === 201, "HOD approve -> 201", r.status);
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: st1.studentId });
  expect(r.status === 200, "advisor fee verification approve -> 200", r.status);
  const verified = await prisma.student.findUniqueOrThrow({ where: { id: st1.studentId }, select: { isVerified: true } });
  expect(verified.isVerified === true, "FINAL VERIFIED set");

  // ─── Test B: one subject pending ──────────────────────────────────────
  console.log("Test B: one subject pending blocks");
  for (const sid of subjects.slice(0, 4)) {
    await staffDecide(st2.studentId, sid, "APPROVED");
  }
  r = await api(advisorTok, "POST", "/advisor/approvals", { studentId: st2.studentId, decision: "APPROVED" });
  expect(r.status === 409, "advisor blocked (pending subject) -> 409", r.status);
  r = await api(hodTok, "POST", "/hod/approvals", { studentId: st2.studentId, decision: "APPROVED" });
  expect(r.status === 409, "HOD blocked (pending subject) -> 409", r.status);
  const v2 = await prisma.student.findUniqueOrThrow({ where: { id: st2.studentId }, select: { isVerified: true } });
  expect(v2.isVerified === false, "final remains false");

  // ─── Test C: one subject rejected ─────────────────────────────────────
  console.log("Test C: one subject rejected blocks");
  for (const sid of subjects.slice(0, 3)) {
    await staffDecide(st3.studentId, sid, "APPROVED");
  }
  r = await staffDecide(st3.studentId, subjects[3], "REJECTED", staffTok, "Lab records incomplete");
  expect(r.status === 201, "staff reject with reason -> 201", r.status);
  r = await api(advisorTok, "POST", "/advisor/approvals", { studentId: st3.studentId, decision: "APPROVED" });
  expect(r.status === 409, "advisor blocked (rejected subject) -> 409", r.status);
  r = await api(staffTok, "POST", "/staff/approvals", { studentId: st3.studentId, subjectId: subjects[3], decision: "APPROVED" });
  expect(r.status === 409, "decision change rejected (immutable) -> 409", r.status);

  // ─── Test D: advisor pending blocks HOD ───────────────────────────────
  console.log("Test D: advisor pending blocks HOD + final");
  for (const sid of subjects) {
    await staffDecide(st4.studentId, sid, "APPROVED");
  }
  r = await api(hodTok, "POST", "/hod/approvals", { studentId: st4.studentId, decision: "APPROVED" });
  expect(r.status === 409, "HOD blocked (advisor pending) -> 409", r.status);
  const v4a = await prisma.student.findUniqueOrThrow({ where: { id: st4.studentId }, select: { isVerified: true } });
  expect(v4a.isVerified === false, "final false while advisor pending");

  // ─── Test E: HOD pending, advisor done ────────────────────────────────
  console.log("Test E: HOD pending, final false");
  r = await api(advisorTok, "POST", "/advisor/approvals", { studentId: st4.studentId, decision: "APPROVED" });
  expect(r.status === 201, "advisor approve -> 201", r.status);
  const v4b = await prisma.student.findUniqueOrThrow({ where: { id: st4.studentId }, select: { isVerified: true } });
  expect(v4b.isVerified === false, "final false while HOD pending");

  // ─── Test F: fee OR logic ─────────────────────────────────────────────
  console.log("Test F: fee OR logic");
  // advisor-only verification, then HOD confirmation on the same student
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: st4.studentId });
  expect(r.status === 200 && r.json.data?.verified === true, "advisor-only fee verification -> 200", r.status);
  let frow = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: st4.studentId } });
  expect(frow.advisorApproved === true && frow.hodApproved === false, "advisor-only flags set");
  // HOD confirms verification (student already verified via advisor), then HOD student decision -> final
  r = await api(hodTok, "POST", "/hod/fees/approve", { studentId: st4.studentId });
  expect(r.status === 200 && r.json.data?.verified === true && r.json.data?.alreadyVerified === true, "HOD confirms already-verified -> 200", r.json.data);
  frow = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: st4.studentId } });
  expect(frow.hodApproved === true && frow.advisorApproved === true, "both flags set (single row)");
  r = await api(hodTok, "POST", "/hod/approvals", { studentId: st4.studentId, decision: "APPROVED" });
  expect(r.status === 201, "HOD approve -> 201", r.status);
  const v4c = await prisma.student.findUniqueOrThrow({ where: { id: st4.studentId }, select: { isVerified: true } });
  expect(v4c.isVerified === true, "FINAL VERIFIED via either fee path");

  // no-approval fee check on student 2 (fee-less + flag-less)
  const st2fees = await prisma.fee.findMany({ where: { studentId: st2.studentId } });
  expect(st2fees.every((f) => !f.advisorApproved && !f.hodApproved), "unapproved fees stay unapproved");

  // ─── Test G: invalid transitions ──────────────────────────────────────
  console.log("Test G: invalid transitions");
  r = await api(studentTok, "POST", "/staff/approvals", { studentId: st5.studentId, subjectId: subjects[0], decision: "APPROVED" });
  expect(r.status === 403, "student cannot approve -> 403", r.status);
  r = await api(staffTok, "POST", "/advisor/approvals", { studentId: st5.studentId, decision: "APPROVED" });
  expect(r.status === 403, "staff cannot advisor-approve -> 403", r.status);
  r = await api(advisorTok, "POST", "/hod/approvals", { studentId: st5.studentId, decision: "APPROVED" });
  expect(r.status === 403, "advisor cannot HOD-approve -> 403", r.status);
  r = await api(hodTok, "POST", "/staff/approvals", { studentId: st5.studentId, subjectId: subjects[0], decision: "APPROVED" });
  expect(r.status === 403, "HOD cannot staff-approve -> 403", r.status);
  r = await api(advisorTok, "POST", "/advisor/approvals", { studentId: st5.studentId, decision: "MAYBE" });
  expect(r.status === 400, "invalid decision -> 400", r.status);
  r = await api(advisorTok, "POST", "/advisor/approvals", { studentId: st5.studentId, decision: "REJECTED" });
  expect(r.status === 400, "reject without reason -> 400", r.status);

  // ─── Test H: cross-scope ──────────────────────────────────────────────
  console.log("Test H: cross-scope blocked");
  r = await api(staffBTok, "POST", "/staff/approvals", { studentId: st5.studentId, subjectId: subjects[0], decision: "APPROVED" });
  expect(r.status === 403, "staff B approves staff A subject -> 403", r.status);
  // advisor of another classroom
  const roomB = await prisma.classroom.create({
    data: { name: "P7B", batch: "2024-2028", semester: 2, section: "Z", departmentId: (await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } })).id },
  });
  const advCUser = await prisma.user.create({
    data: { firstName: "Phase", lastName: "AdvisorC", email: email("advisor-c"), passwordHash: hash, role: Role.ADVISOR, departmentId: (await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } })).id },
  });
  await prisma.advisor.create({ data: { userId: advCUser.id, classroomId: roomB.id } });
  const advCTok = await login(email("advisor-c"), "Verify@12345");
  r = await api(advCTok, "POST", "/advisor/approvals", { studentId: st5.studentId, decision: "APPROVED" });
  expect(r.status === 403, "advisor C approves room-A student -> 403", r.status);
  r = await api(hodEceTok, "POST", "/hod/approvals", { studentId: st5.studentId, decision: "APPROVED" });
  expect(r.status === 403, "ECE HOD approves CSE student -> 403", r.status);
  r = await api(hodEceTok, "POST", "/hod/fees/approve", { studentId: st4.studentId });
  expect(r.status === 403, "ECE HOD approves CSE student fee verification -> 403", r.status);

  // ─── Test I: concurrency + idempotency ────────────────────────────────
  console.log("Test I: concurrency + idempotency");
  for (const sid of subjects) {
    await staffDecide(st5.studentId, sid, "APPROVED");
  }
  const advPayload = { studentId: st5.studentId, decision: "APPROVED" };
  const [a1, a2] = await Promise.all([
    api(advisorTok, "POST", "/advisor/approvals", advPayload),
    api(advisorTok, "POST", "/advisor/approvals", advPayload),
  ]);
  const acodes = [a1.status, a2.status].sort();
  expect(JSON.stringify(acodes) === JSON.stringify([200, 201]), "parallel advisor approve -> 201+200", acodes);
  const advRows = await prisma.approval.count({
    where: { studentId: st5.studentId, approverRole: Role.ADVISOR },
  });
  expect(advRows === 1, "exactly one advisor row", advRows);
  const [f1, f2] = await Promise.all([
    api(advisorTok, "POST", "/advisor/fees/approve", { studentId: st4.studentId }),
    api(advisorTok, "POST", "/advisor/fees/approve", { studentId: st4.studentId }),
  ]);
  expect(f1.status === 200 && f2.status === 200, "parallel fee verification approve -> 200+200", [f1.status, f2.status]);
  const fvRows = await prisma.feeVerification.count({ where: { studentId: st4.studentId } });
  expect(fvRows === 1, "exactly one fee verification row", fvRows);

  // ─── Integrity ────────────────────────────────────────────────────────
  console.log("Integrity");
  const dupes: Array<{ studentId: string; subjectId: string | null; approverRole: Role; c: bigint }> =
    await prisma.$queryRawUnsafe(
      `SELECT "studentId", "subjectId", "approverRole", COUNT(*) c FROM "Approval" GROUP BY 1,2,3 HAVING COUNT(*) > 1`
    );
  // NULL subjectIds group together in Postgres GROUP BY — filter to real dupes
  const realDupes = dupes.filter((d) => d.subjectId !== null);
  expect(realDupes.length === 0, "no duplicate subject approvals", realDupes.length);
  const roleDupes: Array<{ studentId: string; approverRole: Role; c: bigint }> =
    await prisma.$queryRawUnsafe(
      `SELECT "studentId", "approverRole", COUNT(*) c FROM "Approval" WHERE "subjectId" IS NULL AND "approverRole" IN ('ADVISOR','HOD') GROUP BY 1,2 HAVING COUNT(*) > 1`
    );
  expect(roleDupes.length === 0, "no duplicate role approvals", roleDupes.length);
  const orphanFeeRows: Array<{ c: bigint }> = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) c FROM "Fee" f WHERE NOT EXISTS (SELECT 1 FROM "Student" s WHERE s.id = f."studentId")'
  );
  expect(Number(orphanFeeRows[0]?.c ?? 1) === 0, "no orphan fees");
  // isVerified consistency: every verified student satisfies the full condition
  const verifiedList = await prisma.student.findMany({
    where: { isVerified: true, user: { email: { endsWith: `@${TD}` } } },
    select: {
      id: true,
      classroom: { select: { subjects: { select: { id: true } } } },
      approvals: { select: { approverRole: true, status: true, subjectId: true } },
      feeVerification: { select: { advisorApproved: true, hodApproved: true } },
    },
  });
  let consistent = true;
  for (const v of verifiedList) {
    const subIds = v.classroom.subjects.map((s) => s.id);
    const staffOk =
      subIds.length > 0 &&
      subIds.every((sid) =>
        v.approvals.some((a) => a.subjectId === sid && a.approverRole === Role.STAFF && a.status === "APPROVED")
      );
    const advOk = v.approvals.some((a) => a.subjectId === null && a.approverRole === Role.ADVISOR && a.status === "APPROVED");
    const hodOk = v.approvals.some((a) => a.subjectId === null && a.approverRole === Role.HOD && a.status === "APPROVED");
    const feeOk = (v.feeVerification?.advisorApproved ?? false) || (v.feeVerification?.hodApproved ?? false);
    if (!(staffOk && advOk && hodOk && feeOk)) consistent = false;
  }
  expect(consistent && verifiedList.length === 2, "verified rows match derived conditions", verifiedList.length);

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
