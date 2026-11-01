import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Routing only, and only for the staff warning desk: public pages never pass
 * through here and never read cookies. A missing desk cookie goes to sign-in;
 * whether the account may use the desk is decided per request in
 * `lib/desk/gate.ts`, and FastAPI checks every call again.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/desk/signin" || pathname.startsWith("/desk/api/")) {
    return NextResponse.next();
  }
  if (!request.cookies.get(env.CAP_SESSION_COOKIE_NAME)?.value) {
    const signInUrl = new URL("/desk/signin", request.url);
    signInUrl.searchParams.set("returnTo", `${pathname}${search}`);
    const response = NextResponse.redirect(signInUrl);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/desk", "/desk/:path*"],
};
