import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendeeList } from "@/components/dash/attendee-list";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import {
  OrgForbidden,
  OrgUnavailable,
} from "@/components/dash/org-unavailable";
import { getManagedOrganiser } from "@/data/events-api";
import { resolveOrgContext } from "@/data/org-context";
import { getOrgAttendees } from "@/data/org-orders";
import { requireViewer } from "@/data/viewer";
import { isTicketStatus, pageParam } from "@/lib/org-orders";

/** Attendees are live and per-organiser; never prerender them. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Attendees" };

export default async function AttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; status?: string; tier?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await requireViewer(`/dash/events/${id}/attendees`);
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const event = managed.listings.find((listing) => listing.id === id);
  if (!event) {
    notFound();
  }
  // Only a tier of this event is passed on; anything else is ignored.
  const tier = event.tiers.find((candidate) => candidate.id === query.tier);
  const status = isTicketStatus(query.status) ? query.status : undefined;
  const context = await resolveOrgContext();
  const result = context.ok
    ? await getOrgAttendees(context, id, {
        page: pageParam(query.page),
        ...(status ? { status } : {}),
        ...(tier ? { tierId: tier.id } : {}),
      })
    : null;
  if (result?.kind === "not-found") {
    notFound();
  }
  const attendees = result?.kind === "ok" ? result.value : null;

  const fallback =
    result?.kind === "forbidden" ? (
      <OrgForbidden what="the attendee list" />
    ) : (
      <OrgUnavailable />
    );

  return (
    <DashShell
      active="events"
      currentOrganiser={managed.organiser.slug}
      eventName={event.title}
      isDemo={false}
      organisers={managed.organisers}
    >
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            className="inline-flex min-h-11 items-center text-caption text-muted-foreground hover:underline"
            href={`/dash/events/${id}`}
          >
            ← {event.title}
          </Link>
          <h1 className="font-display font-semibold text-heading-base">
            Attendees
          </h1>
        </div>
        {attendees ? (
          <AttendeeList
            count={attendees.count}
            listingId={id}
            page={attendees.page}
            rows={attendees.rows}
            status={status}
            tierId={tier?.id}
            tiers={event.tiers.map((t) => ({ id: t.id, name: t.name }))}
            totalPages={attendees.totalPages}
          />
        ) : (
          fallback
        )}
      </main>
    </DashShell>
  );
}
