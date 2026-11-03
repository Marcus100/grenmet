import type {
  BookingProviderSettings,
  BookingServicePublic,
  BookingSettings,
} from "@barrelsgd/api-client";
import { formatDuration } from "@barrelsgd/bookings-web/lib/booking-format";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import type { Metadata } from "next";
import { HoursForm } from "@/components/studio/settings/hours-form";
import { ProfileForm } from "@/components/studio/settings/profile-form";
import { ProviderForm } from "@/components/studio/settings/provider-form";
import { ServiceForm } from "@/components/studio/settings/service-form";
import { StudioAlert } from "@/components/studio/studio-alert";
import { requireSession } from "@/lib/session";
import {
  hhmm,
  moneyWithCurrency,
  periodsByDay,
  WEEKDAYS,
} from "@/lib/settings-view";
import { getSettings } from "@/lib/studio-api";
import { guarded, loadOrganisation } from "@/lib/studio-page";
import { canManageBookings, DEFAULT_TIMEZONE } from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "Settings",
};

interface SettingsPageProps {
  params: Promise<{ orgSlug: string }>;
}

const SECTION = "space-y-4 rounded-lg border border-border p-4 md:p-6";
const SUMMARY =
  "flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium";

/**
 * Owners and admins edit the business's booking settings; members see them.
 * Role only decides what is drawn: each action and the API check it again.
 */
export default async function SettingsPage({ params }: SettingsPageProps) {
  const { orgSlug } = await params;
  const here = `/studio/${orgSlug}/settings`;
  const session = await requireSession(here);

  const org = await loadOrganisation(session, orgSlug, here);
  if (!org.ok) {
    return <StudioAlert backHref="/studio" failure={org.failure} />;
  }
  const organisationId = org.value.id;
  const settings = await guarded(
    () => getSettings(session.accessToken, organisationId),
    here
  );
  if (!settings.ok) {
    return (
      <StudioAlert
        backHref={`/studio/${orgSlug}/agenda`}
        backLabel="Back to the agenda"
        failure={settings.failure}
      />
    );
  }
  const data = settings.value;
  const editable = canManageBookings(org.value.role);
  const zone = data.profile?.timezone ?? DEFAULT_TIMEZONE;
  const currency = data.profile?.currency ?? "XCD";

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">{org.value.name}</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          {editable
            ? "How customers book: your page, services, people and hours."
            : "You can see these settings. Ask an owner or admin to change them."}
        </p>
      </header>

      <section aria-labelledby="profile-heading" className={SECTION}>
        <h2 className="text-lg font-semibold" id="profile-heading">
          Business profile
        </h2>
        <p className="text-muted-foreground text-sm">
          Timezone: {zone}
          {data.profile ? "" : " (until a profile is saved)"}
        </p>
        {editable ? (
          <ProfileForm
            orgSlug={orgSlug}
            profile={data.profile}
            suggestedName={org.value.name}
          />
        ) : (
          <ProfileSummary profile={data.profile} />
        )}
      </section>

      <section aria-labelledby="services-heading" className={SECTION}>
        <h2 className="text-lg font-semibold" id="services-heading">
          Services and deposits
        </h2>
        {data.services.length === 0 ? (
          <Empty className="border-border border">
            <EmptyHeader>
              <EmptyTitle>No services yet</EmptyTitle>
              <EmptyDescription>
                {editable
                  ? "Add the first service below. Customers cannot book until there is one."
                  : "An owner or admin needs to add one before customers can book."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-3">
            {data.services.map((item) => (
              <li className="border-border rounded-lg border p-3" key={item.id}>
                <details>
                  <summary className={SUMMARY}>
                    <span>{item.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {serviceLine(item, currency)}
                    </span>
                  </summary>
                  <div className="pt-4">
                    {editable ? (
                      <ServiceForm
                        currency={currency}
                        depositsAvailable={data.deposits_available}
                        orgSlug={orgSlug}
                        service={item}
                      />
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {item.description ?? "No description."}
                      </p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <div className="border-border space-y-3 border-t pt-4">
            <h3 className="font-medium">Add a service</h3>
            <ServiceForm
              currency={currency}
              depositsAvailable={data.deposits_available}
              orgSlug={orgSlug}
            />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="providers-heading" className={SECTION}>
        <h2 className="text-lg font-semibold" id="providers-heading">
          Providers and weekly hours
        </h2>
        {data.providers.length === 0 ? (
          <Empty className="border-border border">
            <EmptyHeader>
              <EmptyTitle>No providers yet</EmptyTitle>
              <EmptyDescription>
                {editable
                  ? "Add the people (or chairs, bays, rooms) who do the work. Each needs hours before customers see times."
                  : "An owner or admin needs to add one before customers can book."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-3">
            {data.providers.map((item) => (
              <li className="border-border rounded-lg border p-3" key={item.id}>
                <ProviderCard
                  editable={editable}
                  orgSlug={orgSlug}
                  provider={item}
                  services={data.services}
                  zone={zone}
                />
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <div className="border-border space-y-3 border-t pt-4">
            <h3 className="font-medium">Add a provider</h3>
            <ProviderForm orgSlug={orgSlug} services={data.services} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="more-heading" className={SECTION}>
        <h2 className="text-lg font-semibold" id="more-heading">
          Not available yet
        </h2>
        <Empty className="border-border border">
          <EmptyHeader>
            <EmptyTitle>Time off, extra hours and menu order</EmptyTitle>
            <EmptyDescription>
              The API supports them but this screen does not edit them yet.
              Until then, time off cannot be set here and services and providers
              are listed in their saved order.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    </div>
  );
}

function serviceLine(item: BookingServicePublic, currency: string): string {
  const parts = [
    formatDuration(item.duration_min),
    moneyWithCurrency(item.price_minor, currency),
  ];
  if (item.deposit_minor > 0) {
    parts.push(`${moneyWithCurrency(item.deposit_minor, currency)} deposit`);
  }
  if (!item.active) {
    parts.push("not offered");
  }
  return parts.join(", ");
}

function ProfileSummary({ profile }: { profile: BookingSettings["profile"] }) {
  if (!profile) {
    return (
      <Empty className="border-border border">
        <EmptyHeader>
          <EmptyTitle>No booking profile yet</EmptyTitle>
          <EmptyDescription>
            An owner or admin needs to create it before customers can book
            online.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const rows: [string, string][] = [
    ["Business name", profile.display_name],
    ["Booking address", profile.public_slug],
    ["Online booking", profile.enabled ? "Open" : "Closed"],
    ["Currency", profile.currency ?? "XCD"],
    ["Time slot length", `${profile.slot_step_min} minutes`],
    ["Minimum notice", `${profile.lead_time_min} minutes`],
    ["Booking window", `${profile.horizon_days} days`],
    [
      "Cancellation cutoff",
      `${profile.cancel_cutoff_hours} hours before the start`,
    ],
    [
      "Requests",
      profile.requires_confirmation
        ? "Confirmed by hand"
        : "Booked straight away",
    ],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground text-sm">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProviderCard({
  editable,
  orgSlug,
  provider,
  services,
  zone,
}: {
  editable: boolean;
  orgSlug: string;
  provider: BookingProviderSettings;
  services: BookingServicePublic[];
  zone: string;
}) {
  const offered = services.filter((item) =>
    provider.service_ids.includes(item.id)
  );
  return (
    <details>
      <summary className={SUMMARY}>
        <span>{provider.name}</span>
        <span className="text-muted-foreground text-sm">
          {offered.length} {offered.length === 1 ? "service" : "services"}
          {provider.active ? "" : ", not taking bookings"}
        </span>
      </summary>
      <div className="space-y-6 pt-4">
        {editable ? (
          <>
            <ProviderForm
              orgSlug={orgSlug}
              provider={provider}
              services={services}
            />
            <div className="border-border space-y-3 border-t pt-4">
              <h3 className="font-medium">Weekly hours</h3>
              <HoursForm
                hours={provider.working_hours}
                orgSlug={orgSlug}
                providerId={provider.id}
                zone={zone}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {offered.map((item) => item.name).join(", ") ||
                "No services chosen yet."}
            </p>
            <HoursList hours={provider.working_hours} zone={zone} />
          </>
        )}
      </div>
    </details>
  );
}

function HoursList({
  hours,
  zone,
}: {
  hours: BookingProviderSettings["working_hours"];
  zone: string;
}) {
  const days = periodsByDay(hours);
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Weekly hours on the business clock ({zone}).
      </p>
      {hours.length === 0 ? (
        <p className="font-medium">No hours set, so no times are offered.</p>
      ) : (
        <dl className="grid gap-1">
          {WEEKDAYS.map((weekday, day) => (
            <div className="flex gap-3" key={weekday}>
              <dt className="text-muted-foreground w-28">{weekday}</dt>
              <dd>
                {(days[day] ?? [])
                  .map((p) => `${hhmm(p.start_time)} to ${hhmm(p.end_time)}`)
                  .join(", ") || "Closed"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
