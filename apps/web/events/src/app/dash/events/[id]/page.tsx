import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Banknote, Receipt, Scale, ScanLine, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/dash/activity-panel";
import { DashShell } from "@/components/dash/dash-shell";
import { draftFromEvent } from "@/components/dash/event-draft";
import { EventEditor } from "@/components/dash/event-editor";
import { EventLifecycle } from "@/components/dash/event-lifecycle";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { WhatsAppDraftPanel } from "@/components/dash/whatsapp-draft-panel";
import { getListingActivity, getManagedOrganiser } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { env } from "@/env";
import { buildWhatsAppDraft } from "@/lib/whatsapp-draft";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pilot?: string | string[] }>;
}) {
  const { id } = await params;
  const showWhatsAppPilot = (await searchParams).pilot === "whatsapp";
  const returnTo = `/dash/events/${encodeURIComponent(id)}`;
  await requireViewer(
    showWhatsAppPilot ? `${returnTo}?pilot=whatsapp` : returnTo
  );
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const event = managed.listings.find((listing) => listing.id === id);
  if (!event) {
    notFound();
  }

  const activity = await getListingActivity(event.id);
  const initial = draftFromEvent(event);
  const whatsapp = showWhatsAppPilot
    ? buildWhatsAppDraft(event, env.NEXT_PUBLIC_SITE_URL, new Date())
    : null;

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
            <h1 className="font-display text-heading-base mt-1 font-semibold">
              Customise event
            </h1>
          </div>
          {event.admission === "ticketed" ? (
            <div className="flex flex-wrap gap-2">
              <Link
                className={cn(buttonVariants({ variant: "outline" }))}
                href={`/dash/events/${event.id}/orders`}
              >
                <Receipt data-icon="inline-start" />
                Orders
              </Link>
              <Link
                className={cn(buttonVariants({ variant: "outline" }))}
                href={`/dash/events/${event.id}/attendees`}
              >
                <Users data-icon="inline-start" />
                Attendees
              </Link>
              <Link
                className={cn(buttonVariants({ variant: "outline" }))}
                href={`/dash/events/${event.id}/outlet`}
              >
                <Banknote data-icon="inline-start" />
                Outlet sales
              </Link>
              <Link
                className={cn(buttonVariants({ variant: "outline" }))}
                href={`/dash/events/${event.id}/settlement`}
              >
                <Scale data-icon="inline-start" />
                Settlement
              </Link>
              <Link
                className={cn(buttonVariants({ variant: "outline" }))}
                href={`/dash/events/${event.id}/door`}
              >
                <ScanLine data-icon="inline-start" />
                Door
              </Link>
            </div>
          ) : null}
        </div>
        <EventEditor
          initial={initial}
          listingId={event.id}
          organisationId={managed.organiser.organisationId ?? null}
        />
        {event.status === "published" ? (
          <EventLifecycle
            canChooseRefund={Boolean(managed.organiser.organisationId)}
            date={initial.date}
            endTime={initial.endTime}
            listingId={event.id}
            startTime={initial.startTime}
            title={event.title}
          />
        ) : null}
        {whatsapp ? <WhatsAppDraftPanel {...whatsapp} /> : null}
        <ActivityPanel entries={activity} />
      </main>
    </DashShell>
  );
}
