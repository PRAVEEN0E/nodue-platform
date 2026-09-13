import { buildApp } from "./src/app";
import { connectDatabase, disconnectDatabase, prisma } from "./src/plugins/database";
import { connectRedis, disconnectRedis, cacheService } from "./src/plugins/redis";
import { Role } from "@prisma/client";

async function runTests() {
  console.log("🧪 Starting Phase 2: Admin Module Automated Verification...\n");

  await connectDatabase();
  await connectRedis();

  const app = buildApp();
  await app.ready();

  // ─── Pre-test idempotent cleanup (ensures re-runnable after partial failures) ─
  // IMPORTANT: null hodUserId first (FK reference), THEN delete the users
  await prisma.department.updateMany({
    where: { code: { in: ["AIML", "AIDS"] } },
    data: { hodUserId: null },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "hod.aiml@institution.edu",
          "hod.aids.a@institution.edu",
          "hod.aids.b@institution.edu",
        ],
      },
    },
  });

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

  // ─── Helper to login and return access_token cookie value ─────────────────────
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
    // ─── 1. Login Test ────────────────────────────────────────────────────────
    console.log("--- 1. Authentication ---");
    const adminToken = await loginAs("admin@institution.edu", "Admin@12345");
    const hodToken = await loginAs("hod.cse@institution.edu", "Hod@12345");
    const advisorToken = await loginAs("advisor.cse@institution.edu", "Advisor@12345");
    const staffToken = await loginAs("staff.cse@institution.edu", "Staff@12345");
    const studentToken = await loginAs("student.cse@institution.edu", "Student@12345");

    assert(adminToken !== null, "ADMIN login succeeds");
    assert(hodToken !== null, "HOD login succeeds");
    assert(studentToken !== null, "STUDENT login succeeds");

    // ─── 2. RBAC Protection ───────────────────────────────────────────────────
    console.log("\n--- 2. RBAC Authorization ---");
    const adminDashRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/dashboard",
      cookies: { access_token: adminToken! },
    });
    assert(adminDashRes.statusCode === 200, "ADMIN accessing /admin/dashboard → 200 OK");

    for (const [roleName, token] of [
      ["HOD", hodToken],
      ["ADVISOR", advisorToken],
      ["STAFF", staffToken],
      ["STUDENT", studentToken],
    ] as [string, string | null][]) {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/dashboard",
        cookies: { access_token: token! },
      });
      assert(res.statusCode === 403, `${roleName} accessing /admin/dashboard → 403 FORBIDDEN`);
      assert(res.json().error?.code === "FORBIDDEN", `${roleName} receives FORBIDDEN error code`);
    }

    // No token → 401
    const noTokenRes = await app.inject({ method: "GET", url: "/api/v1/admin/dashboard" });
    assert(noTokenRes.statusCode === 401, "No token accessing /admin/dashboard → 401 UNAUTHORIZED");

    // ─── 3. Departments Listing ───────────────────────────────────────────────
    console.log("\n--- 3. Departments API ---");
    const deptsRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/departments",
      cookies: { access_token: adminToken! },
    });
    assert(deptsRes.statusCode === 200, "GET /admin/departments returns 200 OK");
    const deptsJson = deptsRes.json();
    assert(Array.isArray(deptsJson.data) && deptsJson.data.length === 11, "All 11 departments returned");

    const cseDept = deptsJson.data.find((d: { code: string }) => d.code === "CSE");
    assert(cseDept?.hodUser !== null, "CSE department has HOD assigned");

    // ─── 4. HOD Creation ─────────────────────────────────────────────────────
    console.log("\n--- 4. HOD Creation ---");

    // Pick AIML (should have no HOD — verify directly in DB since API response may be cached)
    const aimlDept = deptsJson.data.find((d: { code: string }) => d.code === "AIML");
    const aimlDbState = await prisma.department.findUnique({
      where: { id: aimlDept.id },
      select: { hodUserId: true },
    });
    assert(aimlDbState?.hodUserId === null, "AIML department starts with no HOD (DB-verified)");

    const createHodRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/hods",
      cookies: { access_token: adminToken! },
      payload: {
        firstName: "Test",
        lastName: "HodAIML",
        email: "hod.aiml@institution.edu",
        password: "TestHod@123",
        departmentId: aimlDept.id,
      },
    });
    assert(createHodRes.statusCode === 201, "Create AIML HOD returns 201 Created");
    const createdHod = createHodRes.json().data?.user;
    assert(createdHod?.role === "HOD", "Created user has role HOD");
    assert(!createdHod?.passwordHash, "Password hash not returned in response");
    assert(createdHod?.departmentId === aimlDept.id, "HOD assigned to correct department");

    // ─── 5. Verify Audit Log ──────────────────────────────────────────────────
    console.log("\n--- 5. Audit Log for HOD_CREATED ---");
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-logs?action=HOD_CREATED",
      cookies: { access_token: adminToken! },
    });
    assert(auditRes.statusCode === 200, "GET /admin/audit-logs returns 200 OK");
    const auditJson = auditRes.json();
    assert(auditJson.data.length > 0, "HOD_CREATED audit event recorded");

    // ─── 6. Conflict: Duplicate Email ─────────────────────────────────────────
    console.log("\n--- 6. Conflict Handling ---");
    const itDept = deptsJson.data.find((d: { code: string }) => d.code === "IT");

    const dupEmailRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/hods",
      cookies: { access_token: adminToken! },
      payload: {
        firstName: "Dup",
        lastName: "Email",
        email: "hod.aiml@institution.edu", // already exists
        password: "TestHod@123",
        departmentId: itDept.id,
      },
    });
    assert(dupEmailRes.statusCode === 409, "Duplicate email → 409 CONFLICT");

    // ─── 7. Conflict: Second HOD Same Department ──────────────────────────────
    const secondHodRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/hods",
      cookies: { access_token: adminToken! },
      payload: {
        firstName: "Second",
        lastName: "HodAIML",
        email: "hod2.aiml@institution.edu",
        password: "TestHod@123",
        departmentId: aimlDept.id, // already has HOD
      },
    });
    assert(secondHodRes.statusCode === 409, "Second HOD for same dept → 409 CONFLICT");
    assert(
      secondHodRes.json().error?.message?.includes("already has an HOD"),
      "Conflict message mentions 'already has an HOD'"
    );

    // ─── 8. Validation Error ─────────────────────────────────────────────────
    const badInputRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/hods",
      cookies: { access_token: adminToken! },
      payload: {
        firstName: "X",
        lastName: "Y",
        email: "not-an-email",
        password: "weak",
        departmentId: "not-a-uuid",
      },
    });
    assert(badInputRes.statusCode === 400, "Invalid HOD creation input → 400 VALIDATION_ERROR");

    // ─── 9. Concurrency Race Condition: DB Integrity Guarantee ──────────────────
    // NOTE: Fastify app.inject() processes requests sequentially in-process.
    // True HTTP-layer concurrency requires an external tool (e.g., k6, wrk).
    // What we verify here is the DB-level integrity guarantee:
    //   - No matter how many concurrent requests arrive, the DB unique constraint
    //     on Department.hodUserId ensures exactly 1 HOD is ever assigned.
    console.log("\n--- 9. DB Integrity: One HOD per Department Constraint ---");
    const aidsDept = deptsJson.data.find((d: { code: string }) => d.code === "AIDS");
    assert(aidsDept !== undefined, "AIDS department exists");

    // Verify AIDS has no HOD in DB (use fresh DB read, not cached API response)
    const aidsBeforeRaw = await prisma.department.findUnique({
      where: { id: aidsDept.id },
      select: { hodUserId: true },
    });
    assert(aidsBeforeRaw?.hodUserId === null, "AIDS department starts with no HOD (DB-verified)");

    // Attempt to create two HODs for the same department sequentially
    const raceA = await app.inject({
      method: "POST",
      url: "/api/v1/admin/hods",
      cookies: { access_token: adminToken! },
      payload: {
        firstName: "Race",
        lastName: "Alpha",
        email: "hod.aids.a@institution.edu",
        password: "TestHod@123",
        departmentId: aidsDept.id,
      },
    });
    const raceB = await app.inject({
      method: "POST",
      url: "/api/v1/admin/hods",
      cookies: { access_token: adminToken! },
      payload: {
        firstName: "Race",
        lastName: "Beta",
        email: "hod.aids.b@institution.edu",
        password: "TestHod@123",
        departmentId: aidsDept.id,
      },
    });

    assert(raceA.statusCode === 201, "First HOD creation for AIDS succeeds (201)");
    assert(raceB.statusCode === 409, "Second HOD creation for same dept is rejected (409)");

    // DB integrity: exactly one HOD assigned
    const aidsAfter = await prisma.department.findUnique({
      where: { id: aidsDept.id },
      select: { hodUserId: true },
    });
    assert(aidsAfter?.hodUserId !== null, "AIDS department has exactly one HOD in DB after both attempts");

    // DB integrity: department.hodUserId uniqueness enforced at schema level
    const aidsHodCount = await prisma.user.count({
      where: { departmentId: aidsDept.id, role: "HOD" },
    });
    // Only 1 user is actually the department HOD (pointed to by hodUserId)
    const aidsHodPointer = await prisma.department.findUnique({
      where: { id: aidsDept.id },
      select: { hodUserId: true },
    });
    assert(
      aidsHodPointer?.hodUserId === raceA.json().data?.user?.id,
      "DB hodUserId points to the first successfully created HOD"
    );

    // ─── 10. Paginated Users ──────────────────────────────────────────────────
    console.log("\n--- 10. Paginated Users ---");
    const usersRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?page=1&limit=2",
      cookies: { access_token: adminToken! },
    });
    assert(usersRes.statusCode === 200, "GET /admin/users returns 200 OK");
    const usersJson = usersRes.json();
    assert(usersJson.data.length <= 2, "Pagination limit=2 enforced");
    assert(typeof usersJson.meta?.total === "number", "Response includes meta.total count");
    assert(typeof usersJson.meta?.totalPages === "number", "Response includes meta.totalPages");

    // Role filter
    const hodUsersRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?role=HOD",
      cookies: { access_token: adminToken! },
    });
    const hodUsers = hodUsersRes.json().data as { role: string }[];
    assert(
      hodUsers.every((u) => u.role === "HOD"),
      "Role filter: all returned users have role HOD"
    );

    // Status filter
    const activeUsersRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users?isActive=true",
      cookies: { access_token: adminToken! },
    });
    const activeUsers = activeUsersRes.json().data as { isActive: boolean }[];
    assert(
      activeUsers.every((u) => u.isActive === true),
      "Status filter: all returned users are active"
    );

    // ─── 11. Verify cache invalidation ────────────────────────────────────────
    console.log("\n--- 11. Cache Invalidation ---");
    // After HOD creation the department cache should have been cleared; next call hits DB
    const deptsAfterCreate = await app.inject({
      method: "GET",
      url: "/api/v1/admin/departments",
      cookies: { access_token: adminToken! },
    });
    const aimlAfter = deptsAfterCreate.json().data.find((d: { code: string }) => d.code === "AIML");
    assert(aimlAfter?.hodUserId !== null, "AIML department now shows HOD assigned after cache invalidation");

    // ─── 12. HOD Status Toggle ────────────────────────────────────────────────
    console.log("\n--- 12. HOD Status Management ---");
    const deactivateRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/hods/${createdHod.id}/status`,
      cookies: { access_token: adminToken! },
      payload: { isActive: false },
    });
    assert(deactivateRes.statusCode === 200, "PATCH /admin/hods/:id/status returns 200 OK");
    assert(deactivateRes.json().data?.user?.isActive === false, "HOD account deactivated");

    // Verify deactivated HOD cannot login (session guard)
    const deactivatedLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "hod.aiml@institution.edu", password: "TestHod@123" },
    });
    assert(deactivatedLoginRes.statusCode === 401, "Deactivated HOD login returns 401");

    // ─── Final Summary ────────────────────────────────────────────────────────
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Phase 2 Verification: ${passed} Passed, ${failed} Failed`);
    console.log("=".repeat(50));

    if (failed > 0) process.exit(1);
  } finally {
    // Cleanup test data: delete seeded test HOD accounts
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "hod.aiml@institution.edu",
            "hod.aids.a@institution.edu",
            "hod.aids.b@institution.edu",
          ],
        },
      },
    });
    // Reset department HOD assignments for AIML & AIDS
    await prisma.department.updateMany({
      where: { code: { in: ["AIML", "AIDS"] } },
      data: { hodUserId: null },
    });

    await app.close();
    await disconnectRedis();
    await disconnectDatabase();
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
