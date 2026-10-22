import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

/** Staff area: business owners and staff sign in with a Barrels account. */
const PROTECTED_PREFIX = "/studio";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`)
  );
}

/**
 * Routing only: a missing session cookie on /studio goes to sign-in. Public
 * pages (the home page and each business's booking page) pass through. Who may
 * see which organisation's data is decided by FastAPI on every call.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }
  if (!request.cookies.get(env.BOOKINGS_SESSION_COOKIE_NAME)?.value) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

/** Skip static assets so JS/CSS chunks are not redirected to /signin. */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
