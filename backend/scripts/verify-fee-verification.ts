/* Fee Verification OR-workflow tests (§18): advisor flow, HOD flow, OR logic,
   idempotency, authorization, client-controlled state resistance, UI content
   regression (no financial fields), overall workflow regression. Run against a
   live dev API:
     npx tsx scripts/verify-fee-verification.ts
   Cleans up bootstrap rows afterwards. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const BASE = process.env.FEE_API_URL || "http://localhost:5000/api/v1";
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

const TD = "phasefee.verify.local";
const email = (n: string) => `${n}@${TD}`;

const FINANCIAL_TOKENS = [
  "totalAmount",
  "paidAmount",
  "dueAmount",
  "balance",
  "status:PARTIAL",
  "feeRecords",
  "paymentRecords",
];

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TD}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    const studentIds = (
      await prisma.student.findMany({ where: { userId: { in: ids } }, select: { id: true } })
    ).map((s) => s.id);
    await prisma.approval.deleteMany({
      where: { OR: [{ approverUserId: { in: ids } }, { student: { userId: { in: ids } } }] },
    });
    await prisma.feeVerification.deleteMany({
      where: { OR: [{ studentId: { in: studentIds } }, { advisorById: { in: ids } }, { hodById: { in: ids } }] },
    });
    await prisma.fee.deleteMany({
      where: { OR: [{ student: { userId: { in: ids } } }, { title: { startsWith: "FV" } }] },
    });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { name: { startsWith: "FV" } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } else {
    await prisma.fee.deleteMany({ where: { title: { startsWith: "FV" } } });
    await prisma.classroom.deleteMany({ where: { name: { startsWith: "FV" } } });
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
  const advisorClassroom = await prisma.classroom.findFirstOrThrow({ where: { name: "CSE-IV-A" } });

  // Second CSE classroom (advisor negative scope) + ECE classroom (HOD negative)
  const roomB = await prisma.classroom.create({
    data: { name: "FV Second", batch: "2024-2028", semester: 2, section: "Z", departmentId: cse.id },
  });
  const roomE = await prisma.classroom.create({
    data: { name: "FV Ece", batch: "2024-2028", semester: 2, section: "Z", departmentId: ece.id },
  });

  async function mkStudent(tag: string, classroomId: string, deptId: string, withFee: boolean) {
    const u = await mkUser("Fee", `Pupil${tag}`, email(`pupil-${tag}`), Role.STUDENT, deptId, hash);
    const s = await prisma.student.create({
      data: { userId: u.id, registerNumber: `FVREG${tag}`, classroomId, departmentId: deptId, admissionYear: 2024 },
    });
    if (withFee) {
      // legacy Fee records still exist in the schema for other modules; this
      // verifies the new verification is independent of record counts/amounts.
      await prisma.fee.create({
        data: { studentId: s.id, title: `FV Tuition ${tag}`, totalAmount: 50000, paidAmount: 0, status: "PENDING" },
      });
    }
    return s.id;
  }

  const sA = await mkStudent("a", advisorClassroom.id, cse.id, true); // advisor happy path
  const sB = await mkStudent("b", advisorClassroom.id, cse.id, true); // HOD-only path
  const sC = await mkStudent("c", roomB.id, cse.id, true); // advisor foreign classroom
  const sD = await mkStudent("d", roomE.id, ece.id, true); // HOD foreign department
  const sE = await mkStudent("e", advisorClassroom.id, cse.id, true); // neither-approved stays pending
  const sF = await mkStudent("f", advisorClassroom.id, cse.id, false); // no legacy fee records

  const advisorTok = await login("advisor.cse@institution.edu", "Advisor@12345");
  const hodTok = await login("hod.cse@institution.edu", "Hod@12345");

  // ─── Advisor flow (1–8) ────────────────────────────────────────────────
  console.log("Advisor flow");
  let r = await api(advisorTok, "GET", "/advisor/fees");
  expect(
    r.status === 200 &&
      Array.isArray(r.json.data) &&
      r.json.data.every(
        (x: any) =>
          "studentId" in x && "studentName" in x && "registerNumber" in x && "verified" in x
      ) &&
      r.json.data.every((x: any) => !FINANCIAL_TOKENS.some((t) => JSON.stringify(x).includes(t))),
    "1. advisor sees authorized students (verification shape, no financial fields)",
    r.status
  );
  expect(
    r.json.data.some((x: any) => x.studentId === sA && x.verified === false),
    "2. advisor sees PENDING status"
  );
  const rowA0 = r.json.data.find((x: any) => x.studentId === sA);
  expect(
    r.json.data.some((x: any) => x.studentId === sF) === true,
    "3. no-fee-record student still listed (PENDING, not 'No records')"
  );

  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: sA });
  expect(r.status === 200 && r.json.data?.verified === true && r.json.data?.alreadyVerified === false, "4. advisor approves -> VERIFIED", r.status);
  const fvA = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: sA } });
  expect(fvA.advisorApproved === true && fvA.hodApproved === false, "5. advisor-only (HOD untouched)");

  r = await api(advisorTok, "GET", "/advisor/fees");
  const rowA1 = r.json.data.find((x: any) => x.studentId === sA);
  expect(r.status === 200 && rowA1.verified === true, "6. status becomes VERIFIED on list");
  expect(
    r.json.data.every((x: any) => !("paymentRecords" in x) && !("feeRecords" in x)),
    "6b. no payment/fee records exposed"
  );

  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: sA });
  expect(r.status === 200 && r.json.data?.verified === true && r.json.data?.alreadyVerified === true, "7. repeat approve idempotent (stays VERIFIED)");
  const fvA2 = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: sA } });
  expect(fvA2.hodApproved === false, "7b. no HOD approval implied by advisor approval");

  const fvN = await prisma.feeVerification.count({ where: { studentId: sA } });
  expect(fvN === 1, "7c. no duplicate verification rows");

  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: sC });
  expect(r.status === 403, "8. advisor cannot approve foreign classroom student", r.status);

  // ─── HOD flow (9–16) ───────────────────────────────────────────────────
  console.log("HOD flow");
  r = await api(hodTok, "GET", "/hod/classrooms?limit=100");
  const codes = (r.json.data as any[]).map((c: any) => c.name);
  expect(r.status === 200 && codes.length > 0 && codes.includes(advisorClassroom.name), "9. HOD sees department classrooms", codes);

  r = await api(hodTok, "GET", `/hod/fees?classroomId=${advisorClassroom.id}&limit=50`);
  const hodRows = (r.json.data as any[]) ?? [];
  expect(
    r.status === 200 &&
      hodRows.every((f: any) => "studentName" in f && "verified" in f && !("totalAmount" in f)),
    "10. classroom students listed (verification shape)"
  );
  const hodIds = new Set(hodRows.map((f: any) => f.studentId));
  expect(!hodIds.has(sC) && !hodIds.has(sD), "11. only selected classroom students");
  expect(hodRows.some((f: any) => f.studentId === sB && f.verified === false), "12. HOD sees PENDING status");

  r = await api(hodTok, "POST", "/hod/fees/approve", { studentId: sB });
  expect(r.status === 200 && r.json.data?.verified === true && r.json.data?.alreadyVerified === false, "13. HOD approves -> VERIFIED", r.status);
  const fvB = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: sB } });
  expect(fvB.hodApproved === true && fvB.advisorApproved === false, "14. HOD-only (advisor untouched)");

  r = await api(hodTok, "POST", "/hod/fees/approve", { studentId: sB });
  expect(r.status === 200 && r.json.data?.alreadyVerified === true, "15. HOD repeat approve idempotent");

  r = await api(hodTok, "GET", `/hod/fees?classroomId=${roomE.id}`);
  expect(r.status === 403, "16a. HOD cannot open foreign department classroom", r.status);
  r = await api(hodTok, "POST", "/hod/fees/approve", { studentId: sD });
  expect(r.status === 403, "16. HOD cannot approve foreign department student", r.status);

  // ─── OR logic (17–20) ──────────────────────────────────────────────────
  console.log("OR logic");
  const sASub = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: sA } });
  const sBSub = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: sB } });
  expect(
    sASub.advisorApproved === true && sASub.hodApproved === false,
    "17. advisor-only -> VERIFIED"
  );
  expect(
    sBSub.advisorApproved === false && sBSub.hodApproved === true,
    "18. HOD-only -> VERIFIED"
  );

  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: sB });
  const bothRow = r.json.data;
  expect(
    r.status === 200 && bothRow?.verified === true && bothRow?.alreadyVerified === true,
    "19. both (advisor-after-HOD) -> stays VERIFIED, no duplicate overflow"
  );
  const fvB2 = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: sB } });
  expect(fvB2.advisorApproved === true && fvB2.hodApproved === true, "19b. both flags set, single row");

  const sEfees = await prisma.feeVerification.findUnique({ where: { studentId: sE } });
  expect(!sEfees || (!sEfees.advisorApproved && !sEfees.hodApproved), "20. neither approved stays PENDING");

  // ─── Client-controlled state (must be ignored) ─────────────────────────
  console.log("Client-controlled state resistance");
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: sA, isVerified: true, hodApproved: true } as any);
  expect(r.status === 200, "21. client flags do not error");
  const fvA3 = await prisma.feeVerification.findUniqueOrThrow({ where: { studentId: sA } });
  expect(fvA3.hodApproved === false, "22. client hodApproved stripped, not applied");
  expect(fvA3.advisorApproved === true, "23. state remains advisor-only");
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: "not-a-uuid" });
  expect(r.status === 400, "24. malformed studentId -> 400", r.status);
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: "00000000-0000-4000-8000-000000000000" });
  expect(r.status === 404, "25. missing student -> 404", r.status);
  r = await api(null, "POST", "/advisor/fees/approve", { studentId: sA });
  expect(r.status === 401, "26. unauthenticated -> 401", r.status);

  // ─── Overall workflow regression (27–29) ───────────────────────────────
  console.log("Overall workflow regression");
  r = await api(advisorTok, "GET", "/advisor/approvals?status=pending&limit=5");
  expect(r.status === 200, "27. subject/advisor approval workflow intact", r.status);
  r = await api(hodTok, "GET", "/hod/approvals?status=pending&limit=5");
  expect(r.status === 200, "28. HOD approval workflow intact", r.status);
  const st = await prisma.student.findUnique({ where: { id: sA }, select: { isVerified: true } });
  expect(st?.isVerified === false, "29. fee VERIFIED alone does NOT set FINAL_VERIFIED");
  r = await api(advisorTok, "POST", "/advisor/fees/approve", { studentId: sF });
  expect(r.status === 200 && r.json.data?.verified === true, "30. zero-record student approvable -> VERIFIED");

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