import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashShell } from "@/components/dash/dash-shell";
import { draftFromEvent } from "@/components/dash/event-draft";
import { EventEditor } from "@/components/dash/event-editor";
import { getEventById } from "@/data/discovery";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const event = await getEventById((await params).id);
  if (!event) {
    notFound();
  }

  return (
    <DashShell active="build" eventName={event.title} isDemo={event.isDemo}>
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
        <EventEditor initial={draftFromEvent(event)} />
      </main>
    </DashShell>
  );
}
