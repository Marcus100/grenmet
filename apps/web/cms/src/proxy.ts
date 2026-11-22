import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "./env";

/**
 * Routing only, and before any page renders: a signed-out visit to the editor
 * goes to sign-in as a redirect, not after the Payload shell has painted. The
 * page itself still checks the account (`payload.auth`), so a stale cookie
 * cannot open the editor.
 */
export function proxy(request: NextRequest) {
  const cookieName = getEnv().CMS_SESSION_COOKIE_NAME;
  if (!request.cookies.get(cookieName)?.value) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
