import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { isBusinessSlug, isReservedSlug } from "@/lib/slug";
import { storefrontExists } from "@/lib/storefront-exists";

/** Staff area: business owners and staff sign in with a Barrels account. */
const PROTECTED_PREFIX = "/studio";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`)
  );
}

/** Next's own not-found route: rendered on the server, status 404. */
export const NOT_FOUND_PATH = "/_not-found";

/**
 * A full page load of `/<slug>` for a business with no booking page. The page
 * would call notFound() while it renders, and Next 16 then sends an empty
 * error document that only fills in with JavaScript; answering here instead
 * gets the not-found page rendered on the server. Client navigations (the
 * `RSC` header) keep the page's own notFound(), which the browser renders. A
 * path with a dot may be a file (`/robots.txt`) and is left to the routes.
 */
async function isMissingBookingPage(request: NextRequest): Promise<boolean> {
  if (
    !(request.method === "GET" || request.method === "HEAD") ||
    request.headers.has("rsc")
  ) {
    return false;
  }
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const [slug] = segments;
  if (
    segments.length !== 1 ||
    slug === undefined ||
    slug.includes(".") ||
    isReservedSlug(slug)
  ) {
    return false;
  }
  if (!isBusinessSlug(slug)) {
    return true;
  }
  return (await storefrontExists(slug, request.headers)) === false;
}

/**
 * Routing only: a missing session cookie on /studio goes to sign-in, and a
 * booking address with no business answers with the not-found page. Public
 * pages (the home page and each business's booking page) pass through. Who may
 * see which organisation's data is decided by FastAPI on every call.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    if (await isMissingBookingPage(request)) {
      return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
        status: 404,
      });
    }
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
