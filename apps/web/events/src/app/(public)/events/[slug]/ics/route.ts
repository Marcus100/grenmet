import { getEventBySlug } from "@/data/events-api";
import { buildIcs } from "@/lib/ics";

/** Renders an .ics download for one event. Render-only; no data writes. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(`/events/${event.slug}`, request.url).toString();
  return new Response(buildIcs(event, url, new Date()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    },
  });
}
