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
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Routing only: a missing session cookie goes to sign-in. Whether the account
 * is allowed in (an active Barrels superuser) is decided on the server per
 * request in `lib/staff-gate.ts`, and FastAPI checks it again on every call.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || pathname === "/auth/logout") {
    return NextResponse.next();
  }
  if (!request.cookies.get(env.BARRELS_ADMIN_SESSION_COOKIE_NAME)?.value) {
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
