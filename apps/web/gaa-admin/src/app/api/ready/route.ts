import { checkDatabase } from "@/db/readiness";
import { listPublishedProducts } from "@/db/wxproducts/authored-queries";
import { checkImageryReady } from "@/db/wxwatch/queries";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const results = await Promise.all([
    checkImageryReady(),
    listPublishedProducts().then(
      () => true,
      () => false
    ),
    checkDatabase(
      env.TRANSPORT_DATABASE_URL,
      ["public.routes", "public.trips", "public.trip_stops"],
      "transport-v1"
    ),
    checkDatabase(
      env.JANITORIAL_DATABASE_URL,
      ["public.buildings", "public.areas", "public.area_tasks"],
      "janitorial-v1"
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
