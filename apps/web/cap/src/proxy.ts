import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAppBaseUrl,
  getAuthAppUrl,
  getSessionCookieName,
} from "@/lib/auth-config";

const PROTECTED_PATHS = ["/admin"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(getSessionCookieName())?.value;
  if (sessionToken) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/signin", getAuthAppUrl());
  signInUrl.searchParams.set(
    "returnTo",
    `${getAppBaseUrl()}${pathname}${search}`
  );
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
