import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getRoleFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.role || null;
  } catch {
    return null;
  }
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
  const accessToken = request.cookies.get("access_token");
  const isAuthenticated = !!accessToken;
  const role = isAuthenticated ? getRoleFromToken(accessToken.value) : null;

  if (pathname === "/") {
    if (!isAuthenticated || !role) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL(getRoleHome(role), request.url));
  }

  if (pathname === "/login") {
    if (isAuthenticated && role) {
      return NextResponse.redirect(new URL(getRoleHome(role), request.url));
    }
    return NextResponse.next();
  }

  const isProtectedRoute = ROLE_PATHS.some(
    (r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`)
  );

  if (isProtectedRoute) {
    if (!isAuthenticated || !role) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const routeRole = pathname.split("/")[1];
    if (routeRole !== role.toLowerCase()) {
      return NextResponse.redirect(new URL(getRoleHome(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/admin/:path*",
    "/hod/:path*",
    "/advisor/:path*",
    "/staff/:path*",
    "/student/:path*",
  ],
};
