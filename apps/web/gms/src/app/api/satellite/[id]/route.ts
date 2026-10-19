import { endpoint } from "@/lib/products";
import { reportError } from "@/lib/report-error";
import { IMAGERY_CACHE_CONTROL } from "@/lib/storm-cache";

const ID = /^\d{1,12}$/;
const IMAGE_TYPE = /^image\/(?:png|jpeg|gif|webp)$/;

/**
 * Proxies one public GOES image from FastAPI (which answers with a file or a
 * short-lived signed redirect), so the API host and bucket stay private and
 * the CDN can cache the bytes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!ID.test(id)) return new Response("Not found", { status: 404 });
  try {
    const upstream = await fetch(endpoint(`images/${id}`, "wxwatch"), {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(10_000),
    });
    const type = upstream.headers.get("content-type")?.split(";")[0] ?? "";
    if (upstream.status === 404) {
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!(upstream.ok && IMAGE_TYPE.test(type) && upstream.body)) {
      return new Response("Image unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": IMAGERY_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    reportError(error, "gms-satellite-image");
    return new Response("Image unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
