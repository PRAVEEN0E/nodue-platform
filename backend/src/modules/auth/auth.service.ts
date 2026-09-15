import crypto from "crypto";
import { prisma } from "../../plugins/database";
import { verifyPassword, hashPassword } from "../../utils/password";
import { UnauthorizedError, ValidationError, NotFoundError } from "../../utils/errors";
import { auditService } from "../../utils/auditService";
import { cacheService } from "../../plugins/redis";
import { env } from "../../config/env";
import {
  LoginInput,
  ChangePasswordInput,
} from "./auth.schema";
import { Role } from "@prisma/client";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Hashes a raw refresh token using SHA-256 for secure database storage
   */
  private hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  /**
   * Validates user credentials, creates a refresh token record, logs an audit entry,
   * and prepares authentication session.
   */
  async login(
    input: LoginInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      departmentId: string | null;
      department?: { id: string; code: string; name: string } | null;
    };
    rawRefreshToken: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        department: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("Your account has been deactivated. Please contact an administrator.");
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Generate secure cryptographically random refresh token
    const rawRefreshToken = crypto.randomBytes(40).toString("hex");
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store hashed refresh token in database
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    // Cache active user status in Redis
    await cacheService.set(`user:active:${user.id}`, true, 300);

    // Audit log state-changing security action
    await auditService.log({
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role, email: user.email },
      ipAddress,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        departmentId: user.departmentId,
        department: user.department,
      },
      rawRefreshToken,
    };
  }

  /**
   * Refreshes access token with automatic Refresh Token Rotation for replay attack protection
   */
  async refreshSession(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    user: {
      id: string;
      email: string;
      role: Role;
      departmentId: string | null;
    };
    newRawRefreshToken: string;
  }> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            departmentId: true,
            isActive: true,
          },
        },
      },
    });

    if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
      if (tokenRecord?.revoked) {
        // Token reuse detection! Revoke all tokens for this user as a security precaution
        await prisma.refreshToken.updateMany({
          where: { userId: tokenRecord.userId },
          data: { revoked: true },
        });
        await auditService.log({
          actorUserId: tokenRecord.userId,
          action: "AUTH_TOKEN_REUSE_DETECTED",
          entityType: "User",
          entityId: tokenRecord.userId,
          ipAddress,
          userAgent,
        });
      }
      throw new UnauthorizedError("Session expired or invalid. Please sign in again.");
    }

    if (!tokenRecord.user.isActive) {
      throw new UnauthorizedError("User account is inactive.");
    }

    // Revoke old refresh token (Token Rotation)
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true },
    });

    // Generate new refresh token
    const newRawRefreshToken = crypto.randomBytes(40).toString("hex");
    const newTokenHash = this.hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: tokenRecord.user.id,
        tokenHash: newTokenHash,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return {
      user: tokenRecord.user,
      newRawRefreshToken,
    };
  }

  /**
   * Revokes user's active session and refresh token
   */
  async logout(
    rawRefreshToken?: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revoked: true },
      });
    }

    if (userId) {
      // Invalidate active user cache
      await cacheService.del(`user:active:${userId}`);

      await auditService.log({
        actorUserId: userId,
        action: "AUTH_LOGOUT",
        entityType: "User",
        entityId: userId,
        ipAddress,
        userAgent,
      });
    }
  }

  /**
   * Fetches current authenticated user's profile with department & role details
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        departmentId: true,
        isActive: true,
        createdAt: true,
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        advisorProfile: {
          select: {
            classroom: {
              select: { id: true, name: true, batch: true, section: true },
            },
          },
        },
        studentProfile: {
          select: {
            registerNumber: true,
            rollNumber: true,
            admissionYear: true,
            classroom: {
              select: { id: true, name: true, batch: true, section: true },
            },
          },
        },
        staffProfile: {
          select: {
            employeeCode: true,
            designation: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError("User not found or inactive.");
    }

    return user;
  }

  /**
   * Changes authenticated user's password and optionally revokes other sessions
   */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    currentRawRefreshToken?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError("User not found or inactive.");
    }

    const isValid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!isValid) {
      throw new ValidationError("Current password is incorrect.");
    }

    const newPasswordHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke sessions
    const currentTokenHash = currentRawRefreshToken ? this.hashToken(currentRawRefreshToken) : null;
    if (input.keepCurrentSession && currentTokenHash) {
      // Revoke all OTHER sessions
      await prisma.refreshToken.updateMany({
        where: {
          userId,
          revoked: false,
          NOT: { tokenHash: currentTokenHash },
        },
        data: { revoked: true },
      });
    } else {
      // Revoke ALL sessions
      await prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    }

    await auditService.log({
      actorUserId: userId,
      action: "AUTH_PASSWORD_CHANGE",
      entityType: "User",
      entityId: userId,
      metadata: { keepCurrentSession: input.keepCurrentSession },
      ipAddress,
      userAgent,
    });

    return { message: "Password updated successfully." };
  }


  /**
   * Retrieves all active, unexpired sessions for the authenticated user.
   */
  async getActiveSessions(
    userId: string,
    currentRawRefreshToken?: string
  ): Promise<
    Array<{
      id: string;
      createdAt: Date;
      expiresAt: Date;
      ipAddress: string | null;
      userAgent: string | null;
      isCurrent: boolean;
    }>
  > {
    const currentHash = currentRawRefreshToken ? this.hashToken(currentRawRefreshToken) : null;

    const tokens = await prisma.refreshToken.findMany({
      where: {
        userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tokenHash: true,
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return tokens.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      ipAddress: t.ipAddress,
      userAgent: t.userAgent,
      isCurrent: currentHash !== null && t.tokenHash === currentHash,
    }));
  }

  /**
   * Revokes a single specific session.
   */
  async revokeSession(
    userId: string,
    sessionId: string,
    currentRawRefreshToken?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ isCurrent: boolean }> {
    const tokenRecord = await prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });

    if (!tokenRecord) {
      throw new NotFoundError("Session not found.");
    }

    await prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revoked: true },
    });

    const currentHash = currentRawRefreshToken ? this.hashToken(currentRawRefreshToken) : null;
    const isCurrent = currentHash !== null && tokenRecord.tokenHash === currentHash;

    await auditService.log({
      actorUserId: userId,
      action: "AUTH_SESSION_REVOKED",
      entityType: "RefreshToken",
      entityId: sessionId,
      metadata: { isCurrent },
      ipAddress,
      userAgent,
    });

    return { isCurrent };
  }

  /**
   * Revokes all active sessions for the user, with optional retention of the current session.
   */
  async revokeAllSessions(
    userId: string,
    keepCurrentSession: boolean,
    currentRawRefreshToken?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ revokedCount: number; isCurrentLoggedOut: boolean }> {
    const currentHash = currentRawRefreshToken ? this.hashToken(currentRawRefreshToken) : null;

    const whereClause: {
      userId: string;
      revoked: boolean;
      NOT?: { tokenHash: string };
    } = { userId, revoked: false };

    if (keepCurrentSession && currentHash) {
      whereClause.NOT = { tokenHash: currentHash };
    }

    const result = await prisma.refreshToken.updateMany({
      where: whereClause,
      data: { revoked: true },
    });

    const isCurrentLoggedOut = !keepCurrentSession || !currentHash;

    await auditService.log({
      actorUserId: userId,
      action: "AUTH_ALL_SESSIONS_REVOKED",
      entityType: "User",
      entityId: userId,
      metadata: { keepCurrentSession, revokedCount: result.count },
      ipAddress,
      userAgent,
    });

    return {
      revokedCount: result.count,
      isCurrentLoggedOut,
    };
  }
}

export const authService = new AuthService();
