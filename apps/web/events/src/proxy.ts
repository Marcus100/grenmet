import { type NextRequest, NextResponse } from "next/server";
import { eventExists } from "@/lib/event-exists";

/** Next's own not-found route: rendered on the server, status 404. */
export const NOT_FOUND_PATH = "/_not-found";

/**
 * Pages under `/events/` that are not an event. A test keeps this equal to the
 * folders on disk, so a new page there is never answered with a 404.
 */
export const EVENTS_PAGES: readonly string[] = ["suggest"];

/** The API's event slug pattern (events `SLUG_PATTERN`). */
const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{1,79}$/u;

/**
 * A full page load of `/events/<slug>` for an event that does not exist. The
 * page calls notFound(), but `(public)/loading.tsx` has already begun the
 * response by then, so the status would be 200; answering here gets the
 * not-found page rendered on the server with status 404. Client navigations
 * (the `RSC` header) keep the page's own notFound(), which the browser renders.
 */
async function isMissingEventPage(request: NextRequest): Promise<boolean> {
  if (
    !(request.method === "GET" || request.method === "HEAD") ||
    request.headers.has("rsc")
  ) {
    return false;
  }
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const [first, slug] = segments;
  if (
    segments.length !== 2 ||
    first !== "events" ||
    slug === undefined ||
    EVENTS_PAGES.includes(slug)
  ) {
    return false;
  }
  if (!EVENT_SLUG.test(slug)) {
    return true;
  }
  return (await eventExists(slug, request.headers)) === false;
}

/**
 * Routing only: an event address with no event answers with the not-found
 * page. Everything else passes through; who may see what is decided by
 * FastAPI on every call.
 */
export async function proxy(request: NextRequest) {
  if (await isMissingEventPage(request)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
      status: 404,
    });
  }
  return NextResponse.next();
}

/** Only the event pages; every other request skips the proxy. */
export const config = {
  matcher: ["/events/:slug"],
};
