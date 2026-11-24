import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

/**
 * Every page is for a signed-in staff member, so the HR app is closed by
 * default. These paths answer without a session: sign-in, the single sign-on
 * hand-off (ADR-0017) and health.
 */
const PUBLIC_PATHS = ["/signin", "/api/health"] as const;
const PUBLIC_PREFIXES = ["/auth/"] as const;

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((path) => pathname === path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Routing only: a missing session cookie sends the visitor to sign-in with the
 * path kept. Who may see which organisation is decided by FastAPI on every call.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (!request.cookies.get(env.HR_SESSION_COOKIE_NAME)?.value) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

/** Skip static assets so JS/CSS chunks are not redirected to /signin. */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|runtime-env\\.js).*)"],
};
