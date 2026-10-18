import "server-only";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

// The machine feeds are served from this host so aggregators and the WMO Alert
// Hub have one stable address, and so the edge can cache them. This only
// forwards the API's answer: no rules and no rewriting of alert content.

const FEED_TIMEOUT_MS = 8000;

// Fresh for 30 s at the edge, then served stale while it refreshes, and for a
// day if the origin is down (a stale feed beats a missing one).
const FEED_CACHE =
  "public, max-age=0, s-maxage=30, stale-while-revalidate=120, stale-if-error=86400";

export async function proxyFeed(
  path: string,
  contentType: string
): Promise<Response> {
  try {
    const upstream = await fetch(`${env.CAP_API_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (upstream.status === 404) {
      return new Response("Not found", {
        headers: { "Cache-Control": "public, s-maxage=30" },
        status: 404,
      });
    }
    if (!upstream.ok) {
      throw new Error(`${path} responded ${upstream.status}`);
    }
    return new Response(await upstream.text(), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": FEED_CACHE,
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    reportError(error, "cap-feed-proxy");
    return new Response("Alert feed temporarily unavailable", {
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
      status: 503,
    });
  }
}
