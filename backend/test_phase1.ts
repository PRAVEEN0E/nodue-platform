import { buildApp } from "./src/app";
import { connectDatabase, disconnectDatabase, prisma } from "./src/plugins/database";
import { connectRedis, disconnectRedis } from "./src/plugins/redis";

async function runTests() {
  console.log("🧪 Starting Phase 1 Foundation Automated Verification...\n");

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

  try {
    // 1. Health & Readiness
    console.log("--- 1. Health & Readiness Probes ---");
    const healthRes = await app.inject({ method: "GET", url: "/health" });
    assert(healthRes.statusCode === 200, "GET /health returns 200");
    const healthJson = healthRes.json();
    assert(healthJson.status === "ok", "GET /health status is 'ok'");

    const readyRes = await app.inject({ method: "GET", url: "/ready" });
    assert(readyRes.statusCode === 200, "GET /ready returns 200");
    const readyJson = readyRes.json();
    assert(
      readyJson.status === "ready" &&
        readyJson.dependencies.database === "connected" &&
        readyJson.dependencies.redis === "connected",
      "GET /ready dependencies are connected"
    );

    // 2. Departments & Redis Cache
    console.log("\n--- 2. Departments API & Redis Caching ---");
    const deptRes1 = await app.inject({ method: "GET", url: "/api/v1/departments" });
    assert(deptRes1.statusCode === 200, "GET /departments returns 200");
    const deptJson1 = deptRes1.json();
    assert(deptJson1.data.length === 11, "All 11 predefined departments returned");

    // Second call should hit Redis cache
    const deptRes2 = await app.inject({ method: "GET", url: "/api/v1/departments" });
    assert(deptRes2.json().source === "cache", "Second GET /departments served from Redis cache");

    // 3. Validation & Error Handling
    console.log("\n--- 3. Validation & Error Handling ---");
    const badInputRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "invalid-email-format", password: "12" },
    });
    assert(badInputRes.statusCode === 400, "Invalid email/password returns 400 Validation Error");
    assert(badInputRes.json().error.code === "VALIDATION_ERROR", "Error response format contains code VALIDATION_ERROR");

    const badCredsRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@institution.edu", password: "WrongPassword99!" },
    });
    assert(badCredsRes.statusCode === 401, "Invalid password returns 401 Unauthorized");

    const noAuthMeRes = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    assert(noAuthMeRes.statusCode === 401, "Unauthenticated /auth/me returns 401 Unauthorized");

    // 4. Authentication (Admin Login & Cookie Handling)
    console.log("\n--- 4. Authentication Flow ---");
    const adminLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@institution.edu", password: "Admin@12345" },
    });
    assert(adminLoginRes.statusCode === 200, "Admin login returns 200 OK");
    const adminCookies = adminLoginRes.cookies;
    const adminAccessTokenCookie = adminCookies.find((c) => c.name === "access_token");
    const adminRefreshTokenCookie = adminCookies.find((c) => c.name === "refresh_token");

    assert(!!adminAccessTokenCookie, "access_token cookie received");
    assert(adminAccessTokenCookie?.httpOnly === true, "access_token cookie is HttpOnly");
    assert(!!adminRefreshTokenCookie, "refresh_token cookie received");

    // Verify /auth/me with Cookie
    const adminMeRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { access_token: adminAccessTokenCookie!.value },
    });
    assert(adminMeRes.statusCode === 200, "GET /auth/me with cookie returns 200 OK");
    assert(adminMeRes.json().data.user.role === "ADMIN", "Authenticated user role is ADMIN");

    // 5. RBAC Middleware Tests
    console.log("\n--- 5. RBAC Authorization ---");
    // Admin accessing /api/v1/audit (ADMIN-only)
    const adminAuditRes = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      cookies: { access_token: adminAccessTokenCookie!.value },
    });
    assert(adminAuditRes.statusCode === 200, "ADMIN can access /api/v1/audit");

    // Student login
    const studentLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "student.cse@institution.edu", password: "Student@12345" },
    });
    const studentToken = studentLoginRes.cookies.find((c) => c.name === "access_token")!.value;

    // Student attempting to access /api/v1/audit
    const studentAuditRes = await app.inject({
      method: "GET",
      url: "/api/v1/audit",
      cookies: { access_token: studentToken },
    });
    assert(studentAuditRes.statusCode === 403, "STUDENT accessing /api/v1/audit is rejected with 403 FORBIDDEN");
    assert(studentAuditRes.json().error.code === "FORBIDDEN", "RBAC returns standardized FORBIDDEN error code");

    // 6. Resource-Level Scoping Tests
    console.log("\n--- 6. Resource-Level Authorization ---");
    const cseDept = await prisma.department.findUnique({ where: { code: "CSE" } });
    const itDept = await prisma.department.findUnique({ where: { code: "IT" } });

    // HOD login (CSE)
    const hodLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "hod.cse@institution.edu", password: "Hod@12345" },
    });
    const hodToken = hodLoginRes.cookies.find((c) => c.name === "access_token")!.value;

    // CSE HOD accessing CSE department
    const hodCseRes = await app.inject({
      method: "GET",
      url: `/api/v1/departments/${cseDept!.id}`,
      cookies: { access_token: hodToken },
    });
    assert(hodCseRes.statusCode === 200, "HOD can access own department (CSE)");

    // CSE HOD attempting to access IT department
    const hodItRes = await app.inject({
      method: "GET",
      url: `/api/v1/departments/${itDept!.id}`,
      cookies: { access_token: hodToken },
    });
    assert(hodItRes.statusCode === 403, "HOD accessing another department (IT) is rejected with 403 FORBIDDEN");

    // 7. Session Revocation & Logout
    console.log("\n--- 7. Session Revocation & Logout ---");
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      cookies: {
        access_token: adminAccessTokenCookie!.value,
        refresh_token: adminRefreshTokenCookie!.value,
      },
    });
    assert(logoutRes.statusCode === 200, "POST /auth/logout returns 200 OK");
    const clearedAccessCookie = logoutRes.cookies.find((c) => c.name === "access_token");
    assert(clearedAccessCookie?.value === "", "Logout clears access_token cookie");

    // 8. Audit Log Database Verification
    console.log("\n--- 8. Audit Log Verification ---");
    const recentAuditLogs = await prisma.auditLog.findMany({
      where: { action: "AUTH_LOGIN" },
      take: 5,
      orderBy: { createdAt: "desc" },
    });
    assert(recentAuditLogs.length > 0, "Audit logs recorded AUTH_LOGIN events in PostgreSQL");

    console.log(`\n========================================`);
    console.log(`Verification Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await app.close();
    await disconnectRedis();
    await disconnectDatabase();
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
