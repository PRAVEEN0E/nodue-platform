import { FastifyReply, FastifyRequest } from "fastify";
import { authService } from "./auth.service";
import { LoginInput } from "./auth.schema";
import { env } from "../../config/env";

const isProduction = env.NODE_ENV === "production";

export const authController = {
  async login(request: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) {
    const ipAddress = request.ip;
    const userAgent = request.headers["user-agent"];

    const { user, rawRefreshToken } = await authService.login(request.body, ipAddress, userAgent);

    // Sign short-lived JWT access token (15 minutes)
    const accessToken = request.server.jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
      },
      { expiresIn: "15m" }
    );

    // Set secure HttpOnly cookies
    reply.setCookie("access_token", accessToken, {
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 15 * 60, // 15 minutes in seconds
    });

    reply.setCookie("refresh_token", rawRefreshToken, {
      path: "/api/v1/auth",
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return reply.status(200).send({
      success: true,
      data: {
        user,
      },
    });
  },

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const rawRefreshToken = request.cookies.refresh_token;

    if (!rawRefreshToken) {
      return reply.status(401).send({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Refresh token missing. Please log in again.",
        },
      });
    }

    const ipAddress = request.ip;
    const userAgent = request.headers["user-agent"];

    const { user, newRawRefreshToken } = await authService.refreshSession(
      rawRefreshToken,
      ipAddress,
      userAgent
    );

    // Sign new access token
    const newAccessToken = request.server.jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
      },
      { expiresIn: "15m" }
    );

    // Rotate refresh token cookie
    reply.setCookie("access_token", newAccessToken, {
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 15 * 60,
    });

    reply.setCookie("refresh_token", newRawRefreshToken, {
      path: "/api/v1/auth",
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.status(200).send({
      success: true,
      data: {
        user,
      },
    });
  },

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const rawRefreshToken = request.cookies.refresh_token;
    const userId = request.user?.userId;
    const ipAddress = request.ip;
    const userAgent = request.headers["user-agent"];

    await authService.logout(rawRefreshToken, userId, ipAddress, userAgent);

    // Clear authentication cookies
    reply.clearCookie("access_token", { path: "/" });
    reply.clearCookie("refresh_token", { path: "/api/v1/auth" });

    return reply.status(200).send({
      success: true,
      data: {
        message: "Logged out successfully",
      },
    });
  },

  async me(request: FastifyRequest, reply: FastifyReply) {
    const user = await authService.getCurrentUser(request.user.userId);

    return reply.status(200).send({
      success: true,
      data: {
        user,
      },
    });
  },
};
