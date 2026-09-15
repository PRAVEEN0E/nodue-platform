import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * nd_session is a lightweight, non-HttpOnly cookie set by the client after a
 * successful login (see src/lib/session-cookie.ts). It contains only the user
 * role string (e.g. "ADMIN") and is readable here on Vercel's Edge Middleware.
 *
 * The actual JWT access_token is HttpOnly and lives on the backend domain
 * (onrender.com), so it is invisible to this middleware running on vercel.app.
 * Real authentication is still enforced by the backend on every API call.
 */
function getRoleFromSession(session: string | undefined): string | null {
  if (!session) return null;
  const role = session.trim().toUpperCase();
  const validRoles = ["ADMIN", "HOD", "ADVISOR", "STAFF", "STUDENT"];
  return validRoles.includes(role) ? role : null;
}

function getRoleHome(role: string | null): string {
  switch (role) {
    case "ADMIN": return "/admin";
    case "HOD": return "/hod";
    case "ADVISOR": return "/advisor";
    case "STAFF": return "/staff";
    case "STUDENT": return "/student";
    default: return "/login";
  }
}

const ROLE_PATHS = ["admin", "hod", "advisor", "staff", "student"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("nd_session");
  const role = getRoleFromSession(session?.value);
  const isAuthenticated = !!role;

  if (pathname === "/") {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL(getRoleHome(role), request.url));
  }

  if (pathname === "/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL(getRoleHome(role), request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/profile" || pathname.startsWith("/profile/")) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  const isProtectedRoute = ROLE_PATHS.some(
    (r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`)
  );

  if (isProtectedRoute) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const routeRole = pathname.split("/")[1];
    if (routeRole !== role!.toLowerCase()) {
      return NextResponse.redirect(new URL(getRoleHome(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/profile",
    "/profile/:path*",
    "/admin/:path*",
    "/hod/:path*",
    "/advisor/:path*",
    "/staff/:path*",
    "/student/:path*",
  ],
};

