import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const PUBLIC_PATHS = [
  "/signin",
  "/api/health",
  "/auth/start",
  "/auth/callback",
];

function isPublicPath(pathname: string): boolean {
  // The home page explains the service to visitors who have not signed in.
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Routing only: a missing session cookie goes to sign-in. Who may see which
 * organisation's data is decided by FastAPI on every call (app-scoped token plus
 * the organisation's `gmsdash` entitlement).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || pathname === "/auth/logout") {
    return NextResponse.next();
  }
  if (!request.cookies.get(env.GMSDASH_SESSION_COOKIE_NAME)?.value) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

/** Skip static assets so JS/CSS chunks are not redirected to /signin. */
export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
