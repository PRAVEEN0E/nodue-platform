import { buildApp } from "../src/app";
import { prisma } from "../src/plugins/database";
import { hashPassword } from "../src/utils/password";
import { Role } from "@prisma/client";

async function runVerification() {
  console.log("=== Starting Password Management & Sessions Verification ===");
  const app = buildApp();
  await app.ready();

  const testEmail = `test_security_${Date.now()}@institution.edu`;
  const initialPassword = "Password@123";
  const newPassword = "NewSecretPassword@456";
  const resetPassword = "ResetPassword@789";

  let createdUserId: string | null = null;

  try {
    // 1. Create a dedicated test user
    console.log(`\n1. Creating test user: ${testEmail}`);
    const passwordHash = await hashPassword(initialPassword);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        firstName: "Security",
        lastName: "Tester",
        role: Role.STAFF,
      },
    });
    createdUserId = user.id;
    console.log("  ✔ Test user created successfully.");

    // 2. Test Login & verify device metadata
    console.log("\n2. Testing Login & device metadata capture (User-Agent & IP)");
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0",
      },
      payload: {
        email: testEmail,
        password: initialPassword,
      },
    });

    if (loginRes.statusCode !== 200) {
      throw new Error(`Login failed with status ${loginRes.statusCode}: ${loginRes.body}`);
    }

    const cookies = loginRes.cookies;
    const accessToken = cookies.find((c) => c.name === "access_token");
    const refreshToken = cookies.find((c) => c.name === "refresh_token");

    if (!accessToken || !refreshToken) {
      throw new Error("Missing auth cookies in login response");
    }

    // Verify token record in database has userAgent
    const dbToken = await prisma.refreshToken.findFirst({
      where: { userId: user.id, revoked: false },
    });
    if (!dbToken || !dbToken.userAgent?.includes("Chrome")) {
      throw new Error(`Device metadata not captured on RefreshToken. Found: ${JSON.stringify(dbToken)}`);
    }
    console.log("  ✔ Login succeeded and RefreshToken stored userAgent & IP correctly.");

    const authCookiesHeader = `access_token=${accessToken.value}; refresh_token=${refreshToken.value}`;

    // 3. Test GET /sessions
    console.log("\n3. Testing GET /api/v1/auth/sessions");
    const sessionsRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/sessions",
      headers: {
        cookie: authCookiesHeader,
      },
    });

    if (sessionsRes.statusCode !== 200) {
      throw new Error(`GET /sessions failed with status ${sessionsRes.statusCode}: ${sessionsRes.body}`);
    }

    const sessionsData = JSON.parse(sessionsRes.body).data.sessions;
    if (!Array.isArray(sessionsData) || sessionsData.length === 0) {
      throw new Error("No active sessions returned");
    }
    const currentSession = sessionsData.find((s) => s.isCurrent === true);
    if (!currentSession) {
      throw new Error("Expected current session to have isCurrent: true");
    }
    console.log(`  ✔ GET /sessions returned ${sessionsData.length} session(s) with isCurrent flagged correctly.`);

    // 4. Test Change Password with incorrect current password
    console.log("\n4. Testing Change Password with incorrect current password");
    const badChangeRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { cookie: authCookiesHeader },
      payload: {
        currentPassword: "WrongPassword@999",
        newPassword,
        keepCurrentSession: true,
      },
    });

    if (badChangeRes.statusCode === 200) {
      throw new Error("Expected error on incorrect current password but got 200 OK");
    }
    console.log(`  ✔ Correctly rejected bad current password with status ${badChangeRes.statusCode}`);

    // 5. Test Change Password with correct password
    console.log("\n5. Testing Change Password with correct password");
    const goodChangeRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { cookie: authCookiesHeader },
      payload: {
        currentPassword: initialPassword,
        newPassword,
        keepCurrentSession: true,
      },
    });

    if (goodChangeRes.statusCode !== 200) {
      throw new Error(`Change password failed with status ${goodChangeRes.statusCode}: ${goodChangeRes.body}`);
    }
    console.log("  ✔ Password changed successfully.");

    // 6. Test Login with new password
    console.log("\n6. Verifying login with updated password");
    const newLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: testEmail,
        password: newPassword,
      },
    });
    if (newLoginRes.statusCode !== 200) {
      throw new Error(`Login with new password failed: ${newLoginRes.body}`);
    }
    console.log("  ✔ Successfully authenticated with updated password.");

    // 7. Test Forgot Password flow
    console.log("\n7. Testing POST /api/v1/auth/forgot-password");
    const forgotRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: testEmail },
    });

    if (forgotRes.statusCode !== 200) {
      throw new Error(`Forgot password failed: ${forgotRes.body}`);
    }
    const forgotData = JSON.parse(forgotRes.body).data;
    const resetToken = forgotData.resetToken;
    if (!resetToken) {
      throw new Error("Expected resetToken in dev mode response");
    }
    console.log(`  ✔ Forgot password token generated: ${resetToken.substring(0, 12)}...`);

    // 8. Test Reset Password flow
    console.log("\n8. Testing POST /api/v1/auth/reset-password");
    const resetRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: resetToken,
        newPassword: resetPassword,
      },
    });

    if (resetRes.statusCode !== 200) {
      throw new Error(`Reset password failed: ${resetRes.body}`);
    }
    console.log("  ✔ Password successfully reset using token.");

    // 9. Verify login with reset password
    console.log("\n9. Verifying login with reset password");
    const resetLoginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "user-agent": "Safari on iPhone" },
      payload: {
        email: testEmail,
        password: resetPassword,
      },
    });
    if (resetLoginRes.statusCode !== 200) {
      throw new Error(`Login with reset password failed: ${resetLoginRes.body}`);
    }
    const resetCookies = resetLoginRes.cookies;
    const resetAccess = resetCookies.find((c) => c.name === "access_token");
    const resetRefresh = resetCookies.find((c) => c.name === "refresh_token");
    const resetAuthHeader = `access_token=${resetAccess?.value}; refresh_token=${resetRefresh?.value}`;
    console.log("  ✔ Successfully authenticated with reset password.");

    // 10. Test Revoke All Other Sessions
    console.log("\n10. Testing POST /api/v1/auth/sessions/revoke-all");
    const revokeAllRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sessions/revoke-all",
      headers: { cookie: resetAuthHeader },
      payload: { keepCurrentSession: true },
    });

    if (revokeAllRes.statusCode !== 200) {
      throw new Error(`Revoke all sessions failed: ${revokeAllRes.body}`);
    }
    console.log("  ✔ Revoke all other sessions succeeded.");

    console.log("\n========================================================");
    console.log("🎉 ALL PASSWORD MANAGEMENT & SESSIONS GATES PASSED!");
    console.log("========================================================");
  } finally {
    if (createdUserId) {
      await prisma.refreshToken.deleteMany({ where: { userId: createdUserId } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: createdUserId } });
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
    await app.close();
    await prisma.$disconnect();
  }
}

runVerification().catch((err) => {
  console.error("❌ Verification Failed:", err);
  process.exit(1);
});
