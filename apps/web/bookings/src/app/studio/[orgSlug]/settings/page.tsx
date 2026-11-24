import type { BookingCalendarFeedStatus } from "@barrelsgd/api-client";
import type { Metadata } from "next";
import { CalendarFeedSection } from "@/components/studio/settings/calendar-feed-section";
import {
  ContactSection,
  HoursSection,
  PaymentsSection,
  PeopleSection,
  ProfileSection,
  ServicesSection,
  SettingsJumpMenu,
} from "@/components/studio/settings/settings-sections";
import { StudioAlert } from "@/components/studio/studio-alert";
import { exampleServiceFor } from "@/lib/deposit-rule";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";
import { loadSettings, loadTimeOffByProvider } from "@/lib/settings-load";
import { getCalendarFeedStatus } from "@/lib/studio-api";
import { canManageBookings, DEFAULT_TIMEZONE } from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "Settings",
};

interface SettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

/** Null when the status cannot be read; the section then says to reload. */
async function loadCalendarStatus(
  accessToken: string,
  organisationId: string
): Promise<BookingCalendarFeedStatus | null> {
  try {
    return await getCalendarFeedStatus(accessToken, organisationId);
  } catch (error) {
    reportError(error, "studio");
    return null;
  }
}

/**
 * Owners and admins edit the business's booking settings; members see them.
 * Each section has its own form and Save button. Role only decides what is
 * drawn: each action and the API check it again.
 */
export default async function SettingsPage({ params }: SettingsPageProps) {
  const { orgSlug } = await params;
  const here = `/studio/${orgSlug}/settings`;
  const session = await requireSession(here);

  const loaded = await loadSettings(session, orgSlug, here);
  if (!loaded.ok) {
    return (
      <StudioAlert
        backHref={loaded.backHref}
        backLabel={loaded.backLabel}
        failure={loaded.failure}
      />
    );
  }
  const { org, data } = loaded;
  const editable = canManageBookings(org.role);
  const zone = data.profile?.timezone ?? DEFAULT_TIMEZONE;
  const timeOff = await loadTimeOffByProvider(
    session,
    org.id,
    data.providers,
    here
  );
  // Only owners and admins may read the feed status; members never call it.
  const calendarStatus = editable
    ? await loadCalendarStatus(session.accessToken, org.id)
    : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">{org.name}</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          {editable
            ? "How customers book: your page, services, people and hours. Each section has its own Save button."
            : "You can see these settings. Ask an owner or admin to change them."}
        </p>
      </header>

      <SettingsJumpMenu />

      <ProfileSection
        editable={editable}
        orgSlug={orgSlug}
        profile={data.profile}
        suggestedName={org.name}
        zone={zone}
      />
      <HoursSection
        editable={editable}
        orgSlug={orgSlug}
        providers={data.providers}
        timeOff={timeOff}
        zone={zone}
      />
      <ServicesSection
        currency={data.profile?.currency ?? "XCD"}
        depositsAvailable={data.deposits_available}
        editable={editable}
        orgSlug={orgSlug}
        services={data.services}
      />
      <PeopleSection
        editable={editable}
        orgSlug={orgSlug}
        providers={data.providers}
        services={data.services}
      />
      <PaymentsSection
        cardPaymentsAvailable={data.card_payments_available ?? false}
        currency={data.profile?.currency ?? "XCD"}
        depositsAvailable={data.deposits_available}
        editable={editable}
        example={exampleServiceFor(data.services)}
        orgSlug={orgSlug}
        profile={data.profile}
      />
      <ContactSection
        editable={editable}
        orgSlug={orgSlug}
        profile={data.profile}
      />
      <CalendarFeedSection
        editable={editable}
        orgSlug={orgSlug}
        status={calendarStatus}
      />
    </div>
  );
}
