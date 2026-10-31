import { type NextRequest, NextResponse } from "next/server";
import { cmsItemForPath } from "@/lib/cms-item";
import { cmsItemExists } from "@/lib/cms-item-exists";

/** Next's own not-found route: rendered on the server, status 404. */
export const NOT_FOUND_PATH = "/_not-found";

/**
 * A missing CMS item answers with the not-found page before its page renders.
 * The item pages call notFound() when the CMS has nothing, and in Next 16 a
 * notFound() thrown while a dynamic page renders sends an empty error document
 * that only fills in with JavaScript. Client navigations (`RSC` header) keep
 * the page's own notFound(), which the browser renders; a CMS that cannot
 * answer leaves the decision to the page.
 */
export async function proxy(request: NextRequest) {
  if (
    !(request.method === "GET" || request.method === "HEAD") ||
    request.headers.has("rsc")
  ) {
    return NextResponse.next();
  }
  const item = cmsItemForPath(request.nextUrl.pathname);
  if (item && (await cmsItemExists(item)) === false) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
      status: 404,
    });
  }
  return NextResponse.next();
}

/** Only the CMS item addresses; every other request skips the proxy. */
export const config = {
  matcher: [
    "/explore/news/:path+",
    "/explore/updates/:path+",
    "/explore/reports/:path+",
    "/explore/explained/:slug",
    "/explore/quiz/:slug",
  ],
};
