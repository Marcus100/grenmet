import { listPublishedProducts } from "@/db/wxproducts/authored-queries";
import { checkImageryReady } from "@/db/wxwatch/queries";
import { getAuthApiBaseUrl, getAuthApiPrefix } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const results = await Promise.all([
    checkImageryReady(),
    listPublishedProducts().then(
      () => true,
      () => false
    ),
    fetch(new URL(`${getAuthApiPrefix()}/utils/ready/`, getAuthApiBaseUrl()), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    }).then(
      (response) => response.ok,
      () => false
    ),
  ]);
  const ready = results.every(Boolean);
  return Response.json(
    { status: ready ? "ready" : "unavailable" },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
