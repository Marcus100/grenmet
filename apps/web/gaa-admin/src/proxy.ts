import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAuthApiBaseUrl,
  getAuthApiPrefix,
  getSessionCookieName,
} from "@/lib/auth-config";

const PUBLIC_PATHS = ["/signin", "/api", "/auth/logout", "/auth/logout-all"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const path = pathname === "" ? "/" : pathname;
  // Runtime routing only: FastAPI validates cookies and CSRF. This avoids
  // baking environment-specific API hosts into the standalone build.
  let upstreamPath: string | null = null;
  if (path === "/_backend/browser-session")
    upstreamPath = "/auth/browser/session";
  else if (path.startsWith("/_backend/weather/")) {
    upstreamPath = `/wxproducts/${path.slice("/_backend/weather/".length)}`;
  }
  if (path.startsWith("/_backend/wxwatch/")) {
    upstreamPath = `/wxwatch/${path.slice("/_backend/wxwatch/".length)}`;
  }
  if (upstreamPath) {
    const target = new URL(
      `${getAuthApiPrefix()}${upstreamPath}`,
      getAuthApiBaseUrl()
    );
    target.search = search;
    return NextResponse.rewrite(target);
  }
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

/**
 * Only run proxy on app routes; exclude static assets so JS/CSS chunks are not
 * redirected to /signin.
 *
 * `wxwatch/.*\.` exempts the archive files under `public/wxwatch/` — anything
 * with a dot in it, i.e. a filename. next/image fetches those server-side
 * without the session cookie, so redirecting them to /signin makes every image
 * fail to render. The `/wxwatch` pages carry no dot and stay behind auth.
 */
export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon\\.ico|images/|wxwatch/.*\\.).*)",
  ],
};
