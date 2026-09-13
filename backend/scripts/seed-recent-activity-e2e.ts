/* Generates live, deterministic Recent-Activity audit events in the demo CSE
   department so the redesign E2E can assert humanized copy:
     1. POST /advisor/students  -> STUDENT_CREATED   (actor: demo advisor)
     2. POST /advisor/fees/approve -> FEE_APPROVED   (actor: demo advisor)
   Idempotent: removes prior @redesign-e2e.verify.local users first.

   Run: npx tsx scripts/seed-recent-activity-e2e.ts [--cleanup] */
import { PrismaClient, Prisma } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();
const BASE = process.env.REDESIGN_API_URL || "http://localhost:5000/api/v1";
const DOMAIN = "redesign-e2e.verify.local";
const EMAIL = `ra-${Date.now().toString(36)}@${DOMAIN}`;
const REG = `REDESIGN-E2E-${Date.now().toString(36)}`;
const PASS = "Redesign@12345";

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/access_token=([^;]+)/);
  if (!m) throw new Error("no access_token cookie");
  return m[1];
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleaned ${ids.length} redesign-e2e users`);
  }
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    await prisma.$disconnect();
    return;
  }

  await cleanup();
  const token = await login("advisor.cse@institution.edu", "Advisor@12345");

  // Presentation fixtures: properly-shaped audit rows for the named workflow
  // events the E2E asserts on (no business writes, test data only).
  const advisorUser = await prisma.user.findUniqueOrThrow({ where: { email: "advisor.cse@institution.edu" } });
  const hodUser = await prisma.user.findUniqueOrThrow({ where: { email: "hod.cse@institution.edu" } });
  const cse = await prisma.department.findUniqueOrThrow({ where: { code: "CSE" } });
  const now = new Date();
  const fixtures: Array<{
    actorUserId: string;
    action: string;
    entityType: string;
    metadata: Prisma.InputJsonValue;
  }> = [
    {
      actorUserId: hodUser.id,
      action: "ADVISOR_APPROVED",
      entityType: "Approval",
      metadata: { decision: "APPROVED", role: "ADVISOR" },
    },
    {
      actorUserId: hodUser.id,
      action: "HOD_APPROVED",
      entityType: "Approval",
      metadata: { decision: "APPROVED", role: "HOD" },
    },
    {
      actorUserId: advisorUser.id,
      action: "FINAL_VERIFIED",
      entityType: "Student",
      metadata: Prisma.JsonNull,
    },
    {
      actorUserId: advisorUser.id,
      action: "SUBJECT_STAFF_MAPPED",
      entityType: "SubjectStaff",
      metadata: { subjectCode: "CS301", staffEmail: "staff.cse@institution.edu" },
    },
  ];
  for (const f of fixtures) {
    await prisma.auditLog.create({
      data: {
        actorUserId: f.actorUserId,
        departmentId: cse.id,
        action: f.action,
        entityType: f.entityType,
        entityId: "",
        metadata: f.metadata,
        createdAt: now,
      },
    });
  }
  console.log(`wrote ${fixtures.length} presentation fixture logs`);

  const createStudent = await fetch(`${BASE}/advisor/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      firstName: "Activity",
      lastName: "Probe",
      email: EMAIL,
      password: PASS,
      registerNumber: REG,
      rollNumber: REG,
      admissionYear: 2023,
    }),
  });
  if (!createStudent.ok) {
    throw new Error(`create student failed ${createStudent.status}: ${await createStudent.text()}`);
  }
  const student = (((await createStudent.json()) as { data: { id: string } }).data);
  console.log("STUDENT_CREATED event written (actor: demo advisor)");

  const approveFee = await fetch(`${BASE}/advisor/fees/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ studentId: student.id }),
  });
  if (!approveFee.ok) {
    throw new Error(`fee approve failed ${approveFee.status}: ${await approveFee.text()}`);
  }
  console.log("FEE_APPROVED event written (actor: demo advisor)");
  console.log(JSON.stringify({ studentId: student.id, email: EMAIL, register: REG }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await prisma.$disconnect();
  process.exit(1);
});