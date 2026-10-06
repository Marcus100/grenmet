import { notFound } from "next/navigation";
import { EventOverview } from "@/components/event-overview";
import { DEMO_EVENT_ID, getEventDashboard } from "@/data/events";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const dashboard = await getEventDashboard(DEMO_EVENT_ID);

  if (!dashboard) {
    notFound();
  }

  return <EventOverview dashboard={dashboard} />;
}
