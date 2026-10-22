import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import type { Metadata } from "next";
import Link from "next/link";
import { NewBookingForm } from "@/components/studio/new-booking-form";
import { StudioAlert } from "@/components/studio/studio-alert";
import { requireSession } from "@/lib/session";
import {
  getBusinessTimezone,
  listProviders,
  listServices,
} from "@/lib/studio-api";
import { ADMIN_REQUIRED } from "@/lib/studio-errors";
import { guarded, loadOrganisation } from "@/lib/studio-page";
import { canManageBookings, todayIn } from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "New booking",
};

interface NewBookingPageProps {
  params: Promise<{ orgSlug: string }>;
}

/** Staff enter a phone or walk-in booking; a final check happens in the action. */
export default async function NewBookingPage({ params }: NewBookingPageProps) {
  const { orgSlug } = await params;
  const here = `/studio/${orgSlug}/bookings/new`;
  const agendaHref = `/studio/${orgSlug}/agenda`;
  const session = await requireSession(here);

  const org = await loadOrganisation(session, orgSlug, here);
  if (!org.ok) {
    return <StudioAlert backHref="/studio" failure={org.failure} />;
  }
  if (!canManageBookings(org.value.role)) {
    return (
      <StudioAlert
        backHref={agendaHref}
        backLabel="Back to the agenda"
        failure={ADMIN_REQUIRED}
      />
    );
  }
  const organisationId = org.value.id;
  const data = await guarded(
    () =>
      Promise.all([
        listServices(session.accessToken, organisationId),
        listProviders(session.accessToken, organisationId),
        getBusinessTimezone(session.accessToken, organisationId),
      ]),
    here
  );
  if (!data.ok) {
    return (
      <StudioAlert
        backHref={agendaHref}
        backLabel="Back to the agenda"
        failure={data.failure}
      />
    );
  }
  const [allServices, allProviders, zone] = data.value;
  const providers = allProviders.filter((item) => item.active);
  const services = allServices.filter((item) =>
    providers.some((provider) => provider.service_ids.includes(item.id))
  );
  const bookable = services.filter((item) => item.active);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
          href={{ pathname: agendaHref }}
        >
          Back to the agenda
        </Link>
        <p className="text-muted-foreground text-sm">{org.value.name}</p>
        <h1 className="font-semibold text-2xl">New booking</h1>
        <p className="text-muted-foreground">
          For a phone call or a walk-in. The booking is confirmed straight away.
        </p>
      </header>
      {bookable.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>Nothing to book yet</EmptyTitle>
            <EmptyDescription>
              A booking needs an active service that an active provider offers.
              Add them to the business first, then come back here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <NewBookingForm
          orgSlug={orgSlug}
          providers={providers}
          services={bookable}
          today={todayIn(zone)}
          zone={zone}
        />
      )}
    </div>
  );
}
