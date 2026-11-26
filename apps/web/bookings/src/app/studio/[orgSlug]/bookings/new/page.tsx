import { PageHeader } from "@barrelsgd/admin-kit/components/page-header";
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
import { CARD, CARD_LINK } from "@/components/studio/studio-ui";
import { requireSession } from "@/lib/session";
import {
  getBusinessProfile,
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
        getBusinessProfile(session.accessToken, organisationId),
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
  const [allServices, allProviders, profile] = data.value;
  const providers = allProviders.filter((item) => item.active);
  const services = allServices.filter((item) =>
    providers.some((provider) => provider.service_ids.includes(item.id))
  );
  const bookable = services.filter((item) => item.active);

  return (
    <div className="space-y-6">
      <Link className={CARD_LINK} href={{ pathname: agendaHref }}>
        Back to the agenda
      </Link>
      <PageHeader
        description="For a phone call or a walk-in. The booking is confirmed straight away."
        title="New booking"
      />
      {bookable.length === 0 ? (
        <Empty className={CARD}>
          <EmptyHeader>
            <EmptyTitle>Nothing to book yet</EmptyTitle>
            <EmptyDescription>
              A booking needs an active service that an active provider offers.
              Add them to the business first, then come back here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={CARD}>
          <NewBookingForm
            currency={profile.currency}
            orgSlug={orgSlug}
            providers={providers}
            services={bookable}
            today={todayIn(profile.timezone)}
            zone={profile.timezone}
          />
        </div>
      )}
    </div>
  );
}
