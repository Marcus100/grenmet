import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

/**
 * Read-only proxy of a public CAP feed from FastAPI, so the feeds are served
 * from this site's own domain (CAP_API_URL may be an internal address). No
 * logic: status and body pass through; an unreachable API is a 503, never an
 * empty feed.
 */
export async function proxyCapFeed(
  path: "/api/cap/rss.xml" | "/api/cap/alerts.geojson",
  contentType: string
): Promise<Response> {
  try {
    const upstream = await fetch(new URL(path, env.CAP_API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? contentType,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    reportError(error, "gms-cap-feed");
    return new Response("CAP feed unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
