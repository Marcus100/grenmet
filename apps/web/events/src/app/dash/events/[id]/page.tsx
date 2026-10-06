import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { draftFromEvent } from "@/components/dash/event-draft";
import { EventEditor } from "@/components/dash/event-editor";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { getManagedOrganiser } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireViewer(`/dash/events/${id}`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const event = managed.listings.find((listing) => listing.id === id);
  if (!event) {
    notFound();
  }

  return (
    <DashShell active="build" eventName={event.title} isDemo={false}>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            className="text-caption text-muted-foreground hover:underline"
            href="/dash/events"
          >
            ← My events
          </Link>
          <h1 className="mt-1 font-display font-semibold text-heading-base">
            Customise event
          </h1>
        </div>
        <EventEditor initial={draftFromEvent(event)} listingId={event.id} />
      </main>
    </DashShell>
  );
}
