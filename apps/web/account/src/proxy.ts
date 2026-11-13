import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

/**
 * Every page is for a signed-in person, so the account app is closed by
 * default. These paths answer without a session: sign-in and the single
 * sign-on hand-off (ADR-0017), health, and the same-origin API proxy, which
 * checks its own session and answers 401 JSON rather than a redirect.
 */
const PUBLIC_PREFIXES = ["/signin", "/auth/", "/api/"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Routing only: a missing session cookie sends the visitor to sign-in with
 * the path kept. Who may see which data is decided by FastAPI on every call.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (!request.cookies.get(env.ACCOUNT_SESSION_COOKIE_NAME)?.value) {
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
