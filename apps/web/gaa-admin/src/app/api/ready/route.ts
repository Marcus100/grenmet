import { checkDatabase } from "@/db/readiness";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const results = await Promise.all([
    checkDatabase(env.WXWATCH_DATABASE_URL, ["public.weather_images"]),
    checkDatabase(env.WXPRODUCTS_DATABASE_URL, [
      "public.products",
      "public.product_suites",
    ]),
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
