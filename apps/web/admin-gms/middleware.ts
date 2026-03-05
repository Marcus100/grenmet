import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Must match AUTH_COOKIE_NAME in src/lib/auth.ts (middleware runs on Edge, cannot import that module). */
const AUTH_COOKIE_NAME = "grenmet_authenticated";

const PUBLIC_PATHS = ["/signin", "/signup"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Normalize: "" or "/" both mean root
  const path = pathname === "" ? "/" : pathname;

  if (isPublicPath(path)) {
    const cookie = request.cookies.get(AUTH_COOKIE_NAME);
    if (cookie?.value) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (!cookie?.value) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon\\.ico|images/).*)",
  ],
};
