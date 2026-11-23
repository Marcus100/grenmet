// The Settings sections, shared by the Settings page and the Services and
// People pages. Each section always renders: with nothing in it, it says so
// and says what to do next (owner rule: never hide an empty section). Forms
// are client components; the summaries and lists here are plain markup.

import type {
  BookingExceptionPublic,
  BookingProfilePublic,
  BookingProviderSettings,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import {
  formatDuration,
  formatHours,
  formatMoney,
} from "@barrelsgd/bookings-web/lib/booking-format";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import Link from "next/link";
import { ContactForm } from "@/components/studio/settings/contact-form";
import { DepositRuleForm } from "@/components/studio/settings/deposit-rule-form";
import { HoursForm } from "@/components/studio/settings/hours-form";
import { PaymentsForm } from "@/components/studio/settings/payments-form";
import { ProfileForm } from "@/components/studio/settings/profile-form";
import { ProviderForm } from "@/components/studio/settings/provider-form";
import { ServiceForm } from "@/components/studio/settings/service-form";
import { TimeOffSection } from "@/components/studio/settings/time-off";
import type { ExampleService } from "@/lib/deposit-rule";
import { hhmm, periodsByDay, WEEKDAYS } from "@/lib/settings-view";

/** The jump menu's targets, in the order the sections appear. */
export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "hours", label: "Hours" },
  { id: "services", label: "Services" },
  { id: "people", label: "People" },
  { id: "payments", label: "Payments" },
  { id: "contact", label: "Contact" },
] as const;

const SECTION =
  "scroll-mt-6 space-y-4 rounded-lg border border-border p-4 md:p-6";
const SUMMARY =
  "flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium";
const JUMP =
  "border-border inline-flex min-h-11 items-center rounded-md border bg-background px-4 font-medium text-foreground hover:bg-muted whitespace-nowrap";
const LINK =
  "text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4";

/** Links to each section on the page, one 44 px target each. */
export function SettingsJumpMenu() {
  return (
    <nav aria-label="Settings sections" className="overflow-x-auto">
      <ul className="flex gap-2">
        {SETTINGS_SECTIONS.map((item) => (
          <li key={item.id}>
            <Link className={JUMP} href={`#${item.id}`}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Section({
  children,
  description,
  id,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={SECTION} id={id}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold" id={`${id}-heading`}>
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyNote({
  action,
  description,
  title,
}: {
  action?: { href: string; label: string };
  description: string;
  title: string;
}) {
  return (
    <Empty className="border-border border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent>
          {/* An in-page anchor (#profile, #people): a plain link, as in the other apps. */}
          <a className={LINK} href={action.href}>
            {action.label}
          </a>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function ProfileSection({
  editable,
  orgSlug,
  profile,
  suggestedName,
  zone,
}: {
  editable: boolean;
  orgSlug: string;
  profile: BookingProfilePublic | null;
  suggestedName: string;
  zone: string;
}) {
  return (
    <Section
      description={`Timezone: ${zone}${profile ? "" : " (until a profile is saved)"}.`}
      id="profile"
      title="Business profile"
    >
      {editable ? (
        <ProfileForm
          orgSlug={orgSlug}
          profile={profile}
          suggestedName={suggestedName}
        />
      ) : (
        <ProfileSummary profile={profile} />
      )}
    </Section>
  );
}

export function ServicesSection({
  currency,
  depositsAvailable,
  editable,
  orgSlug,
  services,
}: {
  currency: string;
  depositsAvailable: boolean;
  editable: boolean;
  orgSlug: string;
  services: BookingServicePublic[];
}) {
  return (
    <Section
      description="Each service has a price and, when you take one, a deposit. Customers see services on your booking page."
      id="services"
      title="Services"
    >
      {services.length === 0 ? (
        <EmptyNote
          description={
            editable
              ? "Add the first service below. Customers cannot book until there is one."
              : "An owner or admin needs to add one before customers can book."
          }
          title="No services yet"
        />
      ) : (
        <ul className="space-y-3">
          {services.map((item) => (
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
                      depositsAvailable={depositsAvailable}
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
            depositsAvailable={depositsAvailable}
            orgSlug={orgSlug}
          />
        </div>
      ) : null}
    </Section>
  );
}

export function PeopleSection({
  editable,
  orgSlug,
  providers,
  services,
}: {
  editable: boolean;
  orgSlug: string;
  providers: BookingProviderSettings[];
  services: BookingServicePublic[];
}) {
  return (
    <Section
      description="The people, chairs, bays or rooms that do the work, and the services each one offers. Their weekly hours are under Hours."
      id="people"
      title="People"
    >
      {providers.length === 0 ? (
        <EmptyNote
          description={
            editable
              ? "Add the people (or chairs, bays, rooms) who do the work. Each needs hours before customers see times."
              : "An owner or admin needs to add one before customers can book."
          }
          title="No providers yet"
        />
      ) : (
        <ul className="space-y-3">
          {providers.map((item) => (
            <li className="border-border rounded-lg border p-3" key={item.id}>
              <ProviderCard
                editable={editable}
                orgSlug={orgSlug}
                provider={item}
                services={services}
              />
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <div className="border-border space-y-3 border-t pt-4">
          <h3 className="font-medium">Add a provider</h3>
          <ProviderForm orgSlug={orgSlug} services={services} />
        </div>
      ) : null}
    </Section>
  );
}

export function HoursSection({
  editable,
  orgSlug,
  providers,
  timeOff,
  zone,
}: {
  editable: boolean;
  orgSlug: string;
  providers: BookingProviderSettings[];
  /** Null for a provider whose time off could not be read. */
  timeOff: Map<string, BookingExceptionPublic[] | null>;
  zone: string;
}) {
  return (
    <Section
      description={`Weekly hours and time off for each provider, on the business clock (${zone}).`}
      id="hours"
      title="Hours"
    >
      {providers.length === 0 ? (
        <EmptyNote
          action={{ href: "#people", label: "Add a provider under People" }}
          description="Hours belong to a provider. Add one first, then set their week here."
          title="No providers, so no hours yet"
        />
      ) : (
        <ul className="space-y-3">
          {providers.map((item) => (
            <li className="border-border rounded-lg border p-3" key={item.id}>
              <details>
                <summary className={SUMMARY}>
                  <span>{item.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {hoursLine(item)}
                  </span>
                </summary>
                <div className="space-y-6 pt-4">
                  {editable ? (
                    <div className="space-y-3">
                      <h3 className="font-medium">Weekly hours</h3>
                      <HoursForm
                        hours={item.working_hours}
                        orgSlug={orgSlug}
                        providerId={item.id}
                        zone={zone}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="font-medium">Weekly hours</h3>
                      <HoursList hours={item.working_hours} zone={zone} />
                    </div>
                  )}
                  <TimeOffSection
                    editable={editable}
                    exceptions={timeOffFor(timeOff, item.id) ?? []}
                    orgSlug={orgSlug}
                    providerId={item.id}
                    unavailable={timeOffFor(timeOff, item.id) === null}
                    zone={zone}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <EmptyNote
        description="Extra hours (open time outside the weekly hours) can be seen and removed under each provider's time off, but not added here yet. Services and providers are listed in their saved order until reordering is built."
        title="Extra hours and menu order"
      />
    </Section>
  );
}

export function PaymentsSection({
  cardPaymentsAvailable,
  currency,
  depositsAvailable,
  editable,
  example,
  orgSlug,
  profile,
}: {
  cardPaymentsAvailable: boolean;
  currency: string;
  depositsAvailable: boolean;
  editable: boolean;
  example: ExampleService | null;
  orgSlug: string;
  profile: BookingProfilePublic | null;
}) {
  return (
    <Section
      description="How an online booking is paid for. Deposits are set on each service under Services."
      id="payments"
      title="Payments"
    >
      {profile === null ? (
        <EmptyNote
          action={{
            href: "#profile",
            label: "Save the business profile first",
          }}
          description="The payment choice is saved with the business profile, so create it first."
          title="No booking profile yet"
        />
      ) : null}
      {profile !== null && editable ? (
        <PaymentsForm
          cardPaymentsAvailable={cardPaymentsAvailable}
          orgSlug={orgSlug}
          profile={profile}
        />
      ) : null}
      {profile !== null && editable ? (
        <DepositRuleForm
          currency={currency}
          depositsAvailable={depositsAvailable}
          example={example}
          orgSlug={orgSlug}
          profile={profile}
        />
      ) : null}
      {profile !== null && !editable ? (
        <dl className="grid gap-3">
          <div>
            <dt className="text-muted-foreground text-sm">
              Payment when booking
            </dt>
            <dd className="font-medium">
              {profile.payment_at_booking === "full_price"
                ? "Full price by card"
                : "Service deposit"}
            </dd>
          </div>
        </dl>
      ) : null}
    </Section>
  );
}

export function ContactSection({
  editable,
  orgSlug,
  profile,
}: {
  editable: boolean;
  orgSlug: string;
  profile: BookingProfilePublic | null;
}) {
  return (
    <Section
      description="How customers reach the business. Only the options you fill in are shown on your booking page."
      id="contact"
      title="Contact"
    >
      {profile === null ? (
        <EmptyNote
          action={{
            href: "#profile",
            label: "Save the business profile first",
          }}
          description="Contact options are saved with the business profile, so create it first."
          title="No booking profile yet"
        />
      ) : null}
      {profile !== null && editable ? (
        <ContactForm orgSlug={orgSlug} profile={profile} />
      ) : null}
      {profile !== null && !editable ? (
        <ContactSummary profile={profile} />
      ) : null}
    </Section>
  );
}

function serviceLine(item: BookingServicePublic, currency: string): string {
  const parts = [
    formatDuration(item.duration_min),
    formatMoney(item.price_minor, currency),
  ];
  if (item.deposit_minor > 0) {
    parts.push(`${formatMoney(item.deposit_minor, currency)} deposit`);
  }
  if (!item.active) {
    parts.push("not offered");
  }
  return parts.join(", ");
}

/** A provider's time off: null when it could not be read (or was never asked for). */
function timeOffFor(
  timeOff: Map<string, BookingExceptionPublic[] | null>,
  providerId: string
): BookingExceptionPublic[] | null {
  return timeOff.get(providerId) ?? null;
}

function hoursLine(item: BookingProviderSettings): string {
  const open = periodsByDay(item.working_hours).filter(
    (day) => day.length > 0
  ).length;
  if (open === 0) {
    return "No hours set";
  }
  return `${open} ${open === 1 ? "day" : "days"} open`;
}

function ProfileSummary({ profile }: { profile: BookingProfilePublic | null }) {
  if (!profile) {
    return (
      <EmptyNote
        description="An owner or admin needs to create it before customers can book online."
        title="No booking profile yet"
      />
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
      `${formatHours(profile.cancel_cutoff_hours ?? 24)} before the start`,
    ],
    [
      "Requests",
      profile.requires_confirmation
        ? "Confirmed by hand"
        : "Booked straight away",
    ],
    ["Accent colour", profile.brand_color ?? "Not set"],
    ["Logo", profile.logo_file_id ? "Uploaded" : "Not set"],
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

function ContactSummary({ profile }: { profile: BookingProfilePublic }) {
  const rows: [string, string][] = [
    ["Contact phone", profile.contact_phone ?? "Not set"],
    [
      "Contact WhatsApp",
      profile.contact_whatsapp ? `+${profile.contact_whatsapp}` : "Not set",
    ],
    [
      "Contact Instagram",
      profile.contact_instagram ? `@${profile.contact_instagram}` : "Not set",
    ],
    ["Contact email", profile.contact_email ?? "Not set"],
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
}: {
  editable: boolean;
  orgSlug: string;
  provider: BookingProviderSettings;
  services: BookingServicePublic[];
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
      <div className="pt-4">
        {editable ? (
          <ProviderForm
            orgSlug={orgSlug}
            provider={provider}
            services={services}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {offered.map((item) => item.name).join(", ") ||
              "No services chosen yet."}
          </p>
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
