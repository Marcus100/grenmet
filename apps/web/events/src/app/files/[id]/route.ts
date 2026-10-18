import { env } from "@/env";
import { reportError } from "@/lib/report-error";

const FILE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public organiser logos and listing images. Proxies the API's cached redirect
 * so pages only ever reference a same-origin path by file id, never a bucket
 * address. Private files are not served here (the API answers 404 for them).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!FILE_ID.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const upstream = await fetch(
      `${env.AUTH_API_URL}${env.AUTH_API_V1_STR}/storage/public/${id}`,
      { redirect: "manual" }
    );
    const location = upstream.headers.get("location");
    if (upstream.status === 307 && location) {
      return new Response(null, {
        status: 307,
        headers: {
          location,
          "cache-control":
            upstream.headers.get("cache-control") ?? "public, max-age=60",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  } catch (error) {
    reportError(error, "events-file");
    return new Response("Unavailable", { status: 502 });
  }
}
