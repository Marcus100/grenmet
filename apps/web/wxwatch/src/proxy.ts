import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookieName } from "../lib/auth-config";

const PUBLIC_PATHS = [
  "/signin",
  "/api",
  "/auth/logout",
  "/auth/logout-all",
  "/wxwatch",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const path = pathname === "" ? "/" : pathname;
  const sessionToken = request.cookies.get(getSessionCookieName())?.value;

  if (isPublicPath(path)) {
    return NextResponse.next();
  }

  if (!sessionToken) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("returnTo", `${path}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon\\.ico|images/).*)"],
};
