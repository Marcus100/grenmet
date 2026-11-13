import { type NextRequest, NextResponse } from "next/server";
import { cmsItemForPath } from "@/lib/cms-item";
import { cmsItemExists } from "@/lib/cms-item-exists";
import { isUnknownOneWordPath } from "@/lib/top-level-routes";

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
  if (isUnknownOneWordPath(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
      status: 404,
    });
  }
  const item = cmsItemForPath(request.nextUrl.pathname);
  if (item && (await cmsItemExists(item)) === false) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
      status: 404,
    });
  }
  return NextResponse.next();
}

/**
 * The CMS item addresses and any one-word address; every other request skips
 * the proxy. A static asset has a dot, which the one-word check leaves alone.
 */
export const config = {
  matcher: [
    "/:word",
    "/explore/news/:path+",
    "/explore/updates/:path+",
    "/explore/reports/:path+",
    "/explore/explained/:slug",
    "/explore/quiz/:slug",
  ],
};
