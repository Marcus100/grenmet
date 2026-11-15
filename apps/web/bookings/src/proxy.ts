import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { bookingLinkExists } from "@/lib/booking-link-exists";
import { isBusinessSlug, isReservedSlug } from "@/lib/slug";
import { storefrontExists } from "@/lib/storefront-exists";

/** Staff area: business owners and staff sign in with a Barrels account. */
const PROTECTED_PREFIX = "/studio";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`)
  );
}

/** The header for any response to a request that carries the session cookie. */
export const PRIVATE_NO_STORE = "private, no-store";

/** Next's own not-found route: rendered on the server, status 404. */
export const NOT_FOUND_PATH = "/_not-found";

/**
 * An address that leads nowhere: "not-a-page" for a business with no booking
 * page, "booking-link" for a manage link whose token the API does not know.
 */
type MissingAddress = "not-a-page" | "booking-link";

/**
 * A full page load of an address whose page would call notFound() while it
 * renders. Next 16 then sends an empty error document that only fills in with
 * JavaScript; answering here instead gets a page rendered on the server with
 * status 404. Client navigations (the `RSC` header) keep the page's own
 * answer, which the browser renders. A path with a dot may be a file
 * (`/robots.txt`) and is left to the routes.
 *
 * - `/<slug>`: "not-a-page" for a business with no booking page.
 * - `/<slug>/booking/<token>`: "not-a-page" for a business with none, and
 *   "booking-link" for a token the API does not know (the manage page explains
 *   that one itself, with the business's name).
 */
async function missingAddress(
  request: NextRequest
): Promise<MissingAddress | null> {
  if (
    !(request.method === "GET" || request.method === "HEAD") ||
    request.headers.has("rsc")
  ) {
    return null;
  }
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const [slug, booking, token] = segments;
  if (slug === undefined || slug.includes(".") || isReservedSlug(slug)) {
    return null;
  }
  const isBusinessPage = segments.length === 1;
  const isManagePage =
    segments.length === 3 &&
    booking === "booking" &&
    token !== undefined &&
    !token.includes(".");
  if (!(isBusinessPage || isManagePage)) {
    return null;
  }
  if (
    !isBusinessSlug(slug) ||
    (await storefrontExists(slug, request.headers)) === false
  ) {
    return "not-a-page";
  }
  if (isManagePage && token !== undefined) {
    return (await bookingLinkExists(token, request.headers)) === false
      ? "booking-link"
      : null;
  }
  return null;
}

/**
 * Routing only: a missing session cookie on /studio goes to sign-in, and a
 * booking address with no business or no booking answers with status 404.
 * Public pages (the home page and each business's booking page) pass through.
 * Who may see which organisation's data is decided by FastAPI on every call.
 */
export async function proxy(request: NextRequest) {
  const response = await route(request);
  // A signed-in person's page holds their name, email and phone: no shared
  // cache or back-forward cache may keep it for someone else.
  if (request.cookies.get(env.BOOKINGS_SESSION_COOKIE_NAME)?.value) {
    response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  }
  return response;
}

async function route(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    const missing = await missingAddress(request);
    if (missing === "not-a-page") {
      return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
        status: 404,
      });
    }
    if (missing === "booking-link") {
      // The manage page words a dead link itself, because it can name the
      // business; only the status is set here.
      return NextResponse.rewrite(request.nextUrl, { status: 404 });
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
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|runtime-env\\.js).*)"],
};
