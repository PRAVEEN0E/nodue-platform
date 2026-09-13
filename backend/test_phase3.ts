import { buildApp } from "./src/app";
import { connectDatabase, disconnectDatabase, prisma } from "./src/plugins/database";
import { connectRedis, disconnectRedis, cacheService } from "./src/plugins/redis";
import { Role } from "@prisma/client";
import { hashPassword } from "./src/utils/password";

async function runTests() {
  console.log("🧪 Starting Phase 3: HOD Module Automated Verification...\n");

  await connectDatabase();
  await connectRedis();

  const app = buildApp();
  await app.ready();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ─── Setup Secondary HOD (AIML) for Cross-Department Testing ───────────────
  const aimlDept = await prisma.department.findUnique({ where: { code: "AIML" } });
  if (!aimlDept) throw new Error("AIML department not found in DB");

  const cseDept = await prisma.department.findUnique({ where: { code: "CSE" } });
  if (!cseDept) throw new Error("CSE department not found in DB");

  // Idempotent test user cleanup
  await prisma.department.updateMany({
    where: { code: "AIML" },
    data: { hodUserId: null },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "test.hod.aiml@institution.edu",
          "test.advisor.cse@institution.edu",
          "test.advisor.aiml@institution.edu",
        ],
      },
    },
  });
  await prisma.classroom.deleteMany({
    where: {
      name: { in: ["TEST-CSE-1A", "TEST-CSE-1B", "TEST-AIML-1A"] },
    },
  });

  const testPassHash = await hashPassword("TestPass@12345");

  // Create AIML HOD
  const aimlHodUser = await prisma.user.create({
    data: {
      email: "test.hod.aiml@institution.edu",
      passwordHash: testPassHash,
      firstName: "Grace",
      lastName: "Hopper (AIML HOD)",
      role: Role.HOD,
      departmentId: aimlDept.id,
      isActive: true,
    },
  });
  await prisma.department.update({
    where: { id: aimlDept.id },
    data: { hodUserId: aimlHodUser.id },
  });

  // Create AIML Classroom for cross-department tests
  const aimlClassroom = await prisma.classroom.create({
    data: {
      name: "TEST-AIML-1A",
      batch: "2024-2028",
      semester: 1,
      section: "A",
      departmentId: aimlDept.id,
    },
  });

  // Create AIML Advisor for cross-department tests
  const aimlAdvisorUser = await prisma.user.create({
    data: {
      email: "test.advisor.aiml@institution.edu",
      passwordHash: testPassHash,
      firstName: "Ada",
      lastName: "Lovelace",
      role: Role.ADVISOR,
      departmentId: aimlDept.id,
      isActive: true,
    },
  });
  const aimlAdvisor = await prisma.advisor.create({
    data: {
      userId: aimlAdvisorUser.id,
      classroomId: aimlClassroom.id,
    },
  });

  // Helper to login and get session cookie
  async function loginAs(email: string, password: string): Promise<string | null> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password },
    });
    if (res.statusCode !== 200) return null;
    const cookie = res.cookies.find((c) => c.name === "access_token");
    return cookie?.value ?? null;
  }

  try {
    // ─── 1. Authentication & Session Setup ───────────────────────────────────
    console.log("--- 1. Authentication ---");
    const adminToken = await loginAs("admin@institution.edu", "Admin@12345");
    const cseHodToken = await loginAs("hod.cse@institution.edu", "Hod@12345");
    const aimlHodToken = await loginAs("test.hod.aiml@institution.edu", "TestPass@12345");
    const advisorToken = await loginAs("advisor.cse@institution.edu", "Advisor@12345");
    const studentToken = await loginAs("student.cse@institution.edu", "Student@12345");

    assert(adminToken !== null, "ADMIN login succeeds");
    assert(cseHodToken !== null, "CSE HOD login succeeds");
    assert(aimlHodToken !== null, "AIML HOD login succeeds");
    assert(advisorToken !== null, "ADVISOR login succeeds");
    assert(studentToken !== null, "STUDENT login succeeds");

    const cseHodHeaders = { cookie: `access_token=${cseHodToken}` };
    const aimlHodHeaders = { cookie: `access_token=${aimlHodToken}` };
    const adminHeaders = { cookie: `access_token=${adminToken}` };
    const advisorHeaders = { cookie: `access_token=${advisorToken}` };
    const studentHeaders = { cookie: `access_token=${studentToken}` };

    // ─── 2. RBAC Route Protection ─────────────────────────────────────────────
    console.log("\n--- 2. RBAC Route Protection ---");
    const unauthRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/dashboard",
    });
    assert(unauthRes.statusCode === 401, "Unauthenticated access rejected (401)");

    const adminHodRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/dashboard",
      headers: adminHeaders,
    });
    assert(adminHodRes.statusCode === 403, "ADMIN role denied from HOD endpoint (403)");

    const advisorHodRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/dashboard",
      headers: advisorHeaders,
    });
    assert(advisorHodRes.statusCode === 403, "ADVISOR role denied from HOD endpoint (403)");

    const studentHodRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/dashboard",
      headers: studentHeaders,
    });
    assert(studentHodRes.statusCode === 403, "STUDENT role denied from HOD endpoint (403)");

    const cseHodDashRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/dashboard",
      headers: cseHodHeaders,
    });
    assert(cseHodDashRes.statusCode === 200, "CSE HOD authorized on HOD dashboard (200)");

    // ─── 3. Dashboard Metrics & Scoping ───────────────────────────────────────
    console.log("\n--- 3. Dashboard Metrics & Department Scoping ---");
    const dashBody = JSON.parse(cseHodDashRes.body);
    assert(dashBody.success === true, "Dashboard returns success: true");
    assert(dashBody.data.department.code === "CSE", "Dashboard is scoped strictly to CSE");
    assert(dashBody.data.department.counts.classrooms >= 1, "Dashboard returns classroom counts");
    assert(Array.isArray(dashBody.data.recentActivity), "Dashboard includes recent activity array");

    // ─── 4. Department Details & Update ───────────────────────────────────────
    console.log("\n--- 4. Department Details & Controlled Update ---");
    const deptRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/department",
      headers: cseHodHeaders,
    });
    assert(deptRes.statusCode === 200, "GET /hod/department returns 200");
    const deptBody = JSON.parse(deptRes.body);
    assert(deptBody.data.code === "CSE", "Department code matches authenticated HOD department");

    // Attempt department name update
    const updateDeptRes = await app.inject({
      method: "PATCH",
      url: "/api/v1/hod/department",
      headers: cseHodHeaders,
      payload: { name: "Computer Science and Engineering Dept" },
    });
    assert(updateDeptRes.statusCode === 200, "PATCH /hod/department updates allowed name (200)");

    // ─── 5. Classroom Creation & Validation ───────────────────────────────────
    console.log("\n--- 5. Classroom Creation & Validation ---");
    // Invalid schema
    const invalidClassroomRes = await app.inject({
      method: "POST",
      url: "/api/v1/hod/classrooms",
      headers: cseHodHeaders,
      payload: { name: "", batch: "24", semester: 99, section: "" },
    });
    assert(invalidClassroomRes.statusCode === 400, "Invalid classroom payload rejected (400)");

    // Valid creation
    const createClassroomRes = await app.inject({
      method: "POST",
      url: "/api/v1/hod/classrooms",
      headers: cseHodHeaders,
      payload: {
        name: "TEST-CSE-1A",
        batch: "2024-2028",
        semester: 1,
        section: "A",
      },
    });
    assert(createClassroomRes.statusCode === 201, "Classroom creation succeeds (201)");
    const createdClassroom = JSON.parse(createClassroomRes.body).data;
    assert(createdClassroom.departmentId === cseDept.id, "Classroom departmentId derived from HOD (not payload)");

    // Duplicate creation attempt (same identity in same department)
    const dupClassroomRes = await app.inject({
      method: "POST",
      url: "/api/v1/hod/classrooms",
      headers: cseHodHeaders,
      payload: {
        name: "TEST-CSE-1A",
        batch: "2024-2028",
        semester: 1,
        section: "A",
      },
    });
    assert(dupClassroomRes.statusCode === 409, "Duplicate classroom rejected with 409 Conflict");

    // Create second classroom for mapping tests
    const createClassroom2Res = await app.inject({
      method: "POST",
      url: "/api/v1/hod/classrooms",
      headers: cseHodHeaders,
      payload: {
        name: "TEST-CSE-1B",
        batch: "2024-2028",
        semester: 1,
        section: "B",
      },
    });
    assert(createClassroom2Res.statusCode === 201, "Second classroom creation succeeds (201)");
    const createdClassroom2 = JSON.parse(createClassroom2Res.body).data;

    // ─── 6. Classroom Listing & Filtering ─────────────────────────────────────
    console.log("\n--- 6. Classroom Listing & Filtering ---");
    const listClassroomsRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/classrooms?page=1&limit=10&semester=1",
      headers: cseHodHeaders,
    });
    assert(listClassroomsRes.statusCode === 200, "GET /hod/classrooms returns 200");
    const listBody = JSON.parse(listClassroomsRes.body);
    assert(listBody.data.length >= 2, "Returns classrooms matching semester=1");
    assert(listBody.data.every((c: any) => c.departmentId === cseDept.id), "All classrooms belong to CSE");

    // ─── 7. Cross-Department Classroom Isolation ──────────────────────────────
    console.log("\n--- 7. Cross-Department Classroom Isolation ---");
    // CSE HOD attempts to GET AIML classroom
    const getOtherClassroomRes = await app.inject({
      method: "GET",
      url: `/api/v1/hod/classrooms/${aimlClassroom.id}`,
      headers: cseHodHeaders,
    });
    assert(getOtherClassroomRes.statusCode === 403, "CSE HOD blocked from GET AIML classroom (403 Forbidden)");

    // CSE HOD attempts to PATCH AIML classroom
    const patchOtherClassroomRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/hod/classrooms/${aimlClassroom.id}`,
      headers: cseHodHeaders,
      payload: { name: "HACKED-AIML" },
    });
    assert(patchOtherClassroomRes.statusCode === 403, "CSE HOD blocked from PATCH AIML classroom (403 Forbidden)");

    // CSE HOD PATCH own classroom succeeds
    const patchOwnClassroomRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/hod/classrooms/${createdClassroom.id}`,
      headers: cseHodHeaders,
      payload: { name: "TEST-CSE-1A-UPDATED" },
    });
    assert(patchOwnClassroomRes.statusCode === 200, "CSE HOD can PATCH own classroom (200 OK)");

    // ─── 8. Advisor Creation & Validation ─────────────────────────────────────
    console.log("\n--- 8. Advisor Creation & Security ---");
    const createAdvisorRes = await app.inject({
      method: "POST",
      url: "/api/v1/hod/advisors",
      headers: cseHodHeaders,
      payload: {
        firstName: "Test",
        lastName: "Advisor",
        email: "test.advisor.cse@institution.edu",
        password: "Advisor@12345",
      },
    });
    assert(createAdvisorRes.statusCode === 201, "Advisor creation succeeds (201)");
    const createdAdvisor = JSON.parse(createAdvisorRes.body).data;
    assert(createdAdvisor.role === "ADVISOR", "Created user role is ADVISOR");
    assert(createdAdvisor.departmentId === cseDept.id, "Advisor departmentId automatically set to CSE");
    assert(!("password" in createdAdvisor) && !("passwordHash" in createdAdvisor), "Password hash never exposed");

    // Duplicate email rejected
    const dupAdvisorRes = await app.inject({
      method: "POST",
      url: "/api/v1/hod/advisors",
      headers: cseHodHeaders,
      payload: {
        firstName: "Duplicate",
        lastName: "Advisor",
        email: "test.advisor.cse@institution.edu",
        password: "Advisor@12345",
      },
    });
    assert(dupAdvisorRes.statusCode === 409, "Duplicate advisor email rejected with 409 Conflict");

    // ─── 9. Cross-Department Advisor Isolation ────────────────────────────────
    console.log("\n--- 9. Cross-Department Advisor Isolation ---");
    // CSE HOD attempts to GET AIML Advisor
    const getOtherAdvisorRes = await app.inject({
      method: "GET",
      url: `/api/v1/hod/advisors/${aimlAdvisorUser.id}`,
      headers: cseHodHeaders,
    });
    assert(getOtherAdvisorRes.statusCode === 403, "CSE HOD blocked from GET AIML advisor (403 Forbidden)");

    // CSE HOD attempts to PATCH AIML Advisor
    const patchOtherAdvisorRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/hod/advisors/${aimlAdvisorUser.id}`,
      headers: cseHodHeaders,
      payload: { firstName: "Intruder" },
    });
    assert(patchOtherAdvisorRes.statusCode === 403, "CSE HOD blocked from PATCH AIML advisor (403 Forbidden)");

    // ─── 10. Advisor $\rightarrow$ Classroom Mapping & Reassignment ───────────
    console.log("\n--- 10. Advisor-Classroom Mapping & Reassignment ---");
    // Cross-department: CSE HOD tries to map CSE advisor to AIML classroom
    const invalidMapRes1 = await app.inject({
      method: "POST",
      url: `/api/v1/hod/advisors/${createdAdvisor.id}/assign-classroom`,
      headers: cseHodHeaders,
      payload: { classroomId: aimlClassroom.id },
    });
    assert(invalidMapRes1.statusCode === 403, "CSE Advisor to AIML Classroom mapping rejected (403 Forbidden)");

    // Cross-department: CSE HOD tries to map AIML advisor to CSE classroom
    const invalidMapRes2 = await app.inject({
      method: "POST",
      url: `/api/v1/hod/advisors/${aimlAdvisor.id}/assign-classroom`,
      headers: cseHodHeaders,
      payload: { classroomId: createdClassroom.id },
    });
    assert(invalidMapRes2.statusCode === 403, "AIML Advisor mapping by CSE HOD rejected (403 Forbidden)");

    // Valid: Map CSE Advisor to CSE Classroom
    const validMapRes = await app.inject({
      method: "POST",
      url: `/api/v1/hod/advisors/${createdAdvisor.id}/assign-classroom`,
      headers: cseHodHeaders,
      payload: { classroomId: createdClassroom.id },
    });
    assert(validMapRes.statusCode === 200, "Valid CSE Advisor to CSE Classroom mapping succeeds (200 OK)");

    // Safe Reassignment: Map same CSE Advisor to second CSE Classroom
    const reassignRes = await app.inject({
      method: "POST",
      url: `/api/v1/hod/advisors/${createdAdvisor.id}/assign-classroom`,
      headers: cseHodHeaders,
      payload: { classroomId: createdClassroom2.id },
    });
    assert(reassignRes.statusCode === 200, "Safe Advisor reassignment to another classroom succeeds (200 OK)");
    const reassignedAdvisor = JSON.parse(reassignRes.body).data;
    assert(reassignedAdvisor.classroomId === createdClassroom2.id, "Advisor classroomId successfully updated");

    // ─── 11. Advisor Status & Deactivation Enforcement ────────────────────────
    console.log("\n--- 11. Advisor Status Management & Session Deactivation ---");
    const deactivateRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/hod/advisors/${createdAdvisor.id}`,
      headers: cseHodHeaders,
      payload: { isActive: false },
    });
    assert(deactivateRes.statusCode === 200, "Advisor deactivated by HOD (200 OK)");

    // Deactivated advisor cannot login
    const deactivatedLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "test.advisor.cse@institution.edu",
        password: "Advisor@12345",
      },
    });
    assert(deactivatedLoginRes.statusCode === 401, "Deactivated advisor rejected at login (401 Unauthorized)");

    // ─── 12. Department Audit Trail Isolation ─────────────────────────────────
    console.log("\n--- 12. Department Scoped Audit Logs ---");
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/audit-logs?page=1&limit=20",
      headers: cseHodHeaders,
    });
    assert(auditRes.statusCode === 200, "GET /hod/audit-logs returns 200");
    const auditBody = JSON.parse(auditRes.body);
    assert(auditBody.data.length > 0, "Audit logs contain events recorded during HOD actions");
    const actions = auditBody.data.map((l: any) => l.action);
    assert(actions.includes("CLASSROOM_CREATED"), "Audit log contains CLASSROOM_CREATED event");
    assert(actions.includes("ADVISOR_CREATED"), "Audit log contains ADVISOR_CREATED event");
    assert(actions.includes("ADVISOR_ASSIGNED"), "Audit log contains ADVISOR_ASSIGNED event");

    // ─── 13. Phase 7 Foundation Endpoints ─────────────────────────────────────
    console.log("\n--- 13. Approvals & Fees Foundation Endpoints ---");
    const approvalsRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/approvals/summary",
      headers: cseHodHeaders,
    });
    assert(approvalsRes.statusCode === 200, "GET /hod/approvals/summary returns 200");

    const feesRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/fees/summary",
      headers: cseHodHeaders,
    });
    assert(feesRes.statusCode === 200, "GET /hod/fees/summary returns 200");

  } finally {
    // ─── Cleanup Test Artifacts ───────────────────────────────────────────────
    await prisma.department.updateMany({
      where: { code: "AIML" },
      data: { hodUserId: null },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "test.hod.aiml@institution.edu",
            "test.advisor.cse@institution.edu",
            "test.advisor.aiml@institution.edu",
          ],
        },
      },
    });
    await prisma.classroom.deleteMany({
      where: {
        name: { in: ["TEST-CSE-1A", "TEST-CSE-1A-UPDATED", "TEST-CSE-1B", "TEST-AIML-1A"] },
      },
    });

    await disconnectRedis();
    await disconnectDatabase();
  }

  console.log("\n==================================================");
  console.log(`Phase 3 Verification: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
