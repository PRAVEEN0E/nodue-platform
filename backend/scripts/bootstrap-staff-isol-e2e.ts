/* Bootstrap for the advisor staff isolation UI E2E (staff_responsibility/
   advisor_staff_isolation). Creates a fresh AIML-like department, two
   classrooms (IV + III), two advisors, and one staff account created by ADMIN
   into the department pool — then Advisor 01 adopts it into IV-AIML.

   Run against a live dev API (from the backend workspace):
     npx tsx scripts/bootstrap-staff-isol-e2e.ts
   Cleans up the previous run's rows for the same domain first. */
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();
const BASE = process.env.ADVISOR_API_URL || "http://localhost:5000/api/v1";
const DOMAIN = "e2e-isol.verify.local";
const DEPT_CODE = "E2E-ISOL";

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status}`);
  const m = (res.headers.get("set-cookie") || "").match(/access_token=([^;]+)/);
  if (!m) throw new Error("no token");
  return m[1];
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.subjectStaff.deleteMany({
      where: { OR: [{ staff: { userId: { in: ids } } }, { subject: { code: "E2ESBJ1" } }] },
    });
    await prisma.subject.deleteMany({ where: { code: "E2ESBJ1" } });
    await prisma.advisor.deleteMany({ where: { userId: { in: ids } } });
    await prisma.staff.deleteMany({ where: { userId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { department: { code: DEPT_CODE } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.department.deleteMany({ where: { code: DEPT_CODE } });
}

async function main() {
  await cleanup();

  const dept = await prisma.department.create({
    data: { code: DEPT_CODE, name: "E2E Isolation (AIML)" },
  });
  const iv = await prisma.classroom.create({
    data: { name: "IV-AIML (e2e)", batch: "2022-2026", semester: 7, section: "A", departmentId: dept.id },
  });
  const iii = await prisma.classroom.create({
    data: { name: "III-AIML (e2e)", batch: "2023-2027", semester: 5, section: "A", departmentId: dept.id },
  });

  const hash = await hashPassword("Advisor@12345");
  const mk = (fn: string, ln: string, key: string, role: Role) =>
    prisma.user.create({
      data: { firstName: fn, lastName: ln, email: `${key}@${DOMAIN}`, passwordHash: hash, role, departmentId: dept.id, isActive: true },
    });

  const a1 = await mk("Advisor", "One IV-AIML", "ae1", Role.ADVISOR);
  const a2 = await mk("Advisor", "Two III-AIML", "ae2", Role.ADVISOR);
  await prisma.advisor.create({ data: { userId: a1.id, classroomId: iv.id } });
  await prisma.advisor.create({ data: { userId: a2.id, classroomId: iii.id } });

  // ADMIN creates staff (advisor accounts are created directly as server
  // equivalents); created staff enter the department's unassigned pool.
  const adminTok = await login("admin@institution.edu", "Admin@12345");
  const res = await fetch(`${BASE}/admin/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}` },
    body: JSON.stringify({
      firstName: "Staff",
      lastName: "One",
      email: `staff1@${DOMAIN}`,
      password: "Staff@12345",
      employeeCode: "E2EEMP001",
      designation: "Assistant Professor",
      departmentId: dept.id,
    }),
  });
  if (res.status !== 201) throw new Error(`create staff -> ${res.status}`);
  const corp = await res.json();
  const staffId = (corp.data as any)?.id;

  // Advisor 01 adopts the staff member into IV-AIML by mapping to a subject.
  const a1Tok = await login(`ae1@${DOMAIN}`, "Advisor@12345");
  const subjRes = await fetch(`${BASE}/advisor/subjects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${a1Tok}` },
    body: JSON.stringify({ code: "E2ESBJ1", name: "Isolation Subject 1", credits: 4, semester: 7 }),
  });
  if (subjRes.status !== 201) throw new Error(`create subject -> ${subjRes.status}`);
  const subjId = (await subjRes.json()).data.id as string;
  const mapRes = await fetch(`${BASE}/advisor/subjects/${subjId}/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${a1Tok}` },
    body: JSON.stringify({ staffId }),
  });
  if (mapRes.status !== 201) throw new Error(`adopt staff -> ${mapRes.status}`);

  console.log(JSON.stringify({
    status: "ok",
    advisor1: `ae1@${DOMAIN}`,
    advisor2: `ae2@${DOMAIN}`,
    staff: staffId,
    staffName: "Staff One",
    staffEmail: `staff1@${DOMAIN}`,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());