/**
 * session-cookie.ts
 *
 * Manages a lightweight, non-HttpOnly "nd_session" cookie set on the
 * *frontend* domain so that Next.js Edge Middleware can read it during
 * SSR/navigation without needing access to the HttpOnly access_token,
 * which lives on the backend domain (cross-origin, invisible to Vercel edge).
 *
 * This cookie carries ONLY the user role — never the JWT itself.
 * Actual authentication is still enforced by the HttpOnly access_token
 * on every backend API call.
 */

const SESSION_COOKIE = "nd_session";

/** Write `nd_session=<role>` on the current (frontend) domain. */
export function setSessionCookie(role: string): void {
  if (typeof document === "undefined") return;
  // 15 minutes – kept in sync with the access_token maxAge.
  const maxAge = 15 * 60;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE}=${role}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

/** Remove the nd_session cookie. */
export function clearSessionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
