import type { Metadata } from "next";
import Link from "next/link";
import { DashShell } from "@/components/dash/dash-shell";
import { emptyDraft } from "@/components/dash/event-draft";
import { EventEditor } from "@/components/dash/event-editor";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { getManagedOrganiser } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireViewer("/dash/events/new");
  if (!(await getManagedOrganiser())) {
    return <NoOrganiserAccess />;
  }
  return (
    <DashShell active="build" eventName="New event" isDemo={false}>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            className="text-caption text-muted-foreground hover:underline"
            href="/dash/events"
          >
            ← My events
          </Link>
          <h1 className="mt-1 font-display font-semibold text-heading-base">
            Create an event
          </h1>
        </div>
        <EventEditor initial={emptyDraft(new Date())} listingId={null} />
      </main>
    </DashShell>
  );
}
