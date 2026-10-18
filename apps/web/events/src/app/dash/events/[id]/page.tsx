import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/dash/activity-panel";
import { DashShell } from "@/components/dash/dash-shell";
import { draftFromEvent } from "@/components/dash/event-draft";
import { EventEditor } from "@/components/dash/event-editor";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { getListingActivity, getManagedOrganiser } from "@/data/events-api";
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

  const activity = await getListingActivity(event.id);

  return (
    <DashShell
      active="build"
      currentOrganiser={managed.organiser.slug}
      eventName={event.title}
      isDemo={false}
      organisers={managed.organisers}
    >
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
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
          {event.admission === "ticketed" ? (
            <Link
              className={cn(buttonVariants({ variant: "outline" }))}
              href={`/dash/events/${event.id}/door`}
            >
              <ScanLine data-icon="inline-start" />
              Door
            </Link>
          ) : null}
        </div>
        <EventEditor initial={draftFromEvent(event)} listingId={event.id} />
        <ActivityPanel entries={activity} />
      </main>
    </DashShell>
  );
}
