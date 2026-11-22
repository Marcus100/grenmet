import { env } from "@/env";
import { isLogoFileId } from "@/lib/brand-logo";
import { reportError } from "@/lib/report-error";

/**
 * A business's public logo. Proxies the API's cached redirect so a page only
 * references a same-origin path by file id, never a bucket address. Only public
 * purposes are served (the API answers 404 for any other file).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isLogoFileId(id)) {
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
    reportError(error, "studio-logo");
    return new Response("Unavailable", { status: 502 });
  }
}
