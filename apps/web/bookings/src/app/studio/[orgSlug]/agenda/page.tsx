import type { BookingAgendaItem } from "@barrelsgd/api-client";
import {
  formatDay,
  formatMoney,
  formatTime,
} from "@barrelsgd/bookings-web/lib/booking-format";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { DepositBadge, StatusBadge } from "@/components/studio/badges";
import { BookingAddress } from "@/components/studio/booking-address";
import { NeedsConfirming } from "@/components/studio/needs-confirming";
import { SetupChecklist } from "@/components/studio/setup-checklist";
import { StudioAlert } from "@/components/studio/studio-alert";
import {
  CARD,
  CARD_LINK,
  FOCUS,
  PRIMARY_ACTION,
  StudioPageHeader,
} from "@/components/studio/studio-ui";
import { env } from "@/env";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";
import { type SetupStep, setupSteps } from "@/lib/setup-checklist";
import { getAgenda, getSettings, listProviders } from "@/lib/studio-api";
import { guarded, loadOrganisation } from "@/lib/studio-page";
import { loadBusinessProfile, loadPendingRequests } from "@/lib/studio-pending";
import {
  type AgendaRange,
  agendaDepositView,
  canManageBookings,
  DEFAULT_TIMEZONE,
  daysIn,
  isUuid,
  parseRange,
  rangeLabel,
  stepDay,
  todayIn,
} from "@/lib/studio-view";

export const metadata: Metadata = {
  title: "Agenda",
};

interface AgendaPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.trim() || undefined;
}

interface Href {
  pathname: string;
  query: Record<string, string>;
}

const CONTROL =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 font-medium transition-colors duration-[120ms]";

function pill(active: boolean): string {
  return cn(
    CONTROL,
    FOCUS,
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-foreground hover:bg-muted active:bg-muted"
  );
}

/** The day and week controls share one row on a phone: narrower padding, still 44 px tall. */
function compactPill(active: boolean): string {
  return cn(
    "border-border inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors duration-[120ms]",
    FOCUS,
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-foreground hover:bg-muted active:bg-muted"
  );
}

export default async function AgendaPage({
  params,
  searchParams,
}: AgendaPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const base = `/studio/${orgSlug}/agenda`;
  const session = await requireSession(base);

  const providerParam = first(query.provider);
  const providerId = isUuid(providerParam) ? providerParam : undefined;
  const offsetParam = Number(first(query.offset));
  const offset =
    Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;

  const org = await loadOrganisation(session, orgSlug, base);
  if (!org.ok) {
    return <StudioAlert backHref="/studio" failure={org.failure} />;
  }
  const organisationId = org.value.id;

  // "Today" is the day on the business's own calendar, so its zone comes first.
  // The same profile read gives the public booking address for the header.
  const profile = await guarded(
    () => loadBusinessProfile(session.accessToken, organisationId),
    base
  );
  if (!profile.ok) {
    return <StudioAlert backHref="/studio" failure={profile.failure} />;
  }
  const publicSlug = profile.value.publicSlug;
  const today = todayIn(profile.value.timezone);
  const range = parseRange(
    { view: first(query.view), date: first(query.date) },
    today
  );

  const [agenda, providers, setupSteps, pending] = await Promise.all([
    guarded(
      () =>
        getAgenda(session.accessToken, organisationId, {
          fromDate: range.from,
          toDate: range.to,
          providerId,
          ...(offset > 0 ? { offset } : {}),
        }),
      base
    ),
    // The filter is a convenience: without providers the agenda still works.
    listProviders(session.accessToken, organisationId).catch((error) => {
      reportError(error, "studio");
      return [];
    }),
    setupChecklistSteps(
      session.accessToken,
      organisationId,
      canManageBookings(org.value.role),
      base
    ),
    guarded(
      () =>
        loadPendingRequests(
          session.accessToken,
          organisationId,
          profile.value.timezone
        ),
      base
    ),
  ]);
  const showSetup = setupSteps.some((step) => !step.done);

  const link = (overrides: {
    date?: string;
    offset?: number;
    provider?: string | null;
    view?: string;
  }) => {
    const next: Record<string, string> = {
      view: overrides.view ?? range.view,
      date: overrides.date ?? range.day,
    };
    const provider =
      overrides.provider === undefined ? providerId : overrides.provider;
    if (provider) {
      next.provider = provider;
    }
    if (overrides.offset) {
      next.offset = String(overrides.offset);
    }
    return { pathname: base, query: next };
  };

  // Names come from every provider so old bookings keep theirs; only active
  // providers are offered as filters.
  const providerNames = new Map(providers.map((item) => [item.id, item.name]));
  const activeProviders = providers.filter((item) => item.active);

  return (
    <div className="space-y-6">
      <StudioPageHeader
        action={
          canManageBookings(org.value.role) ? (
            <Link
              className={PRIMARY_ACTION}
              href={{ pathname: `/studio/${orgSlug}/bookings/new` }}
            >
              New booking
            </Link>
          ) : null
        }
        title="Agenda"
      />

      <NeedsConfirming orgSlug={orgSlug} pending={pending} />

      {showSetup ? (
        <SetupChecklist orgSlug={orgSlug} steps={setupSteps} />
      ) : null}

      {publicSlug ? (
        <BookingAddress
          orgSlug={orgSlug}
          publicSlug={publicSlug}
          siteOrigin={env.NEXT_PUBLIC_SITE_URL}
        />
      ) : (
        <p className={`${CARD} text-foreground text-sm`}>
          Your booking page has no address yet.{" "}
          <Link
            className={CARD_LINK}
            href={{ pathname: `/studio/${orgSlug}/settings` }}
          >
            Set it up in Settings
          </Link>
        </p>
      )}

      {/* One row on a phone: previous, today, next, then the day and week views. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Change date" className="flex items-center gap-1">
          <Link
            className={compactPill(false)}
            href={link({ date: stepDay(range, -1) })}
          >
            Prev
          </Link>
          <Link className={compactPill(false)} href={link({ date: today })}>
            Today
          </Link>
          <Link
            className={compactPill(false)}
            href={link({ date: stepDay(range, 1) })}
          >
            Next
          </Link>
        </nav>
        <nav aria-label="Agenda view" className="flex items-center gap-1">
          <Link
            aria-current={range.view === "day" ? "page" : undefined}
            className={compactPill(range.view === "day")}
            href={link({ view: "day" })}
          >
            Day
          </Link>
          <Link
            aria-current={range.view === "week" ? "page" : undefined}
            className={compactPill(range.view === "week")}
            href={link({ view: "week" })}
          >
            Week
          </Link>
        </nav>
      </div>

      {activeProviders.length > 1 ? (
        <nav aria-label="Filter by provider" className="flex flex-wrap gap-2">
          <Link
            aria-current={providerId ? undefined : "true"}
            className={pill(!providerId)}
            href={link({ provider: null })}
          >
            All providers
          </Link>
          {activeProviders.map((provider) => (
            <Link
              aria-current={providerId === provider.id ? "true" : undefined}
              className={pill(providerId === provider.id)}
              href={link({ provider: provider.id })}
              key={provider.id}
            >
              {provider.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <h2 className="text-foreground text-lg font-semibold">
        {rangeLabel(range)}
      </h2>

      {agenda.ok ? (
        <AgendaDays
          days={agenda.value.days}
          nextHref={
            offset + agenda.value.limit < agenda.value.total
              ? link({ offset: offset + agenda.value.limit })
              : null
          }
          orgSlug={orgSlug}
          previousHref={
            offset > 0
              ? link({ offset: Math.max(0, offset - agenda.value.limit) })
              : null
          }
          providerNames={providerNames}
          publicSlug={publicSlug}
          range={range}
          timezone={agenda.value.timezone || DEFAULT_TIMEZONE}
          today={today}
          total={agenda.value.total}
        />
      ) : (
        <StudioAlert
          backHref={base}
          backLabel="Reload the agenda"
          failure={agenda.failure}
        />
      )}
    </div>
  );
}

/**
 * The checklist's steps for an owner or admin. A member gets none, and a failed
 * settings read gives none (the agenda still shows); `guarded` reports the fault.
 */
async function setupChecklistSteps(
  accessToken: string,
  organisationId: string,
  manages: boolean,
  base: string
): Promise<SetupStep[]> {
  if (!manages) {
    return [];
  }
  const settings = await guarded(
    () => getSettings(accessToken, organisationId),
    base
  );
  return settings.ok ? setupSteps(settings.value) : [];
}

function AgendaDays({
  days,
  nextHref,
  orgSlug,
  previousHref,
  publicSlug,
  total: allMatching,
  providerNames,
  range,
  timezone,
  today,
}: {
  days: { bookings: BookingAgendaItem[]; day: string }[];
  nextHref: Href | null;
  orgSlug: string;
  previousHref: Href | null;
  publicSlug: string | null;
  total: number;
  providerNames: Map<string, string>;
  range: AgendaRange;
  timezone: string;
  today: string;
}) {
  const byDay = new Map(days.map((entry) => [entry.day, entry.bookings]));
  const total = days.reduce((sum, entry) => sum + entry.bookings.length, 0);

  // The next step for an empty agenda is the business's own page (what
  // customers see) or, until a profile exists, the Settings that create it.
  const emptyLink = publicSlug
    ? { href: { pathname: `/${publicSlug}` }, label: "Open your booking page" }
    : {
        href: { pathname: `/studio/${orgSlug}/settings` },
        label: "Set up your booking page",
      };

  const emptyNote =
    total === 0 ? (
      <section className={`${CARD} space-y-2`}>
        <h3 className="text-foreground text-lg font-semibold">
          {range.view === "day"
            ? `No bookings on ${formatDay(range.day, true)}`
            : "No bookings this week"}
        </h3>
        <p className="text-foreground/80">
          Bookings made on your booking page appear here as they come in. Try
          another {range.view === "day" ? "day" : "week"}, or choose All
          providers if a filter is on.
        </p>
        <Link className={CARD_LINK} href={emptyLink.href}>
          {emptyLink.label}
        </Link>
      </section>
    ) : null;

  if (emptyNote && range.view === "day") {
    return emptyNote;
  }

  const shown = range.view === "week" ? daysIn(range) : [range.day];
  const paging =
    allMatching > total || previousHref ? (
      <p
        className={`${CARD} text-foreground flex flex-wrap items-center gap-3`}
        role="status"
      >
        <span>{`Showing ${total} of ${allMatching} bookings`}</span>
        {previousHref ? (
          <Link className={pill(false)} href={previousHref}>
            Previous bookings
          </Link>
        ) : null}
        {nextHref ? (
          <Link className={pill(false)} href={nextHref}>
            More bookings
          </Link>
        ) : null}
      </p>
    ) : null;

  return (
    <div className="space-y-6">
      {emptyNote}
      {paging}
      {shown.map((day) => {
        const bookings = byDay.get(day) ?? [];
        return (
          <section aria-labelledby={`day-${day}`} key={day}>
            {range.view === "week" ? (
              <h3
                className="text-foreground mb-2 font-semibold"
                id={`day-${day}`}
              >
                {formatDay(day, true)}
                {day === today ? " (today)" : ""}
              </h3>
            ) : null}
            {bookings.length === 0 ? (
              <p className={`${CARD} text-foreground/80`}>No bookings.</p>
            ) : (
              <ul className={cn(CARD, "divide-border divide-y p-2 sm:p-3")}>
                {bookings.map((booking) => (
                  <li key={booking.id}>
                    <BookingRow
                      booking={booking}
                      orgSlug={orgSlug}
                      providerName={providerNames.get(booking.provider_id)}
                      timezone={timezone}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BookingRow({
  booking,
  orgSlug,
  providerName,
  timezone,
}: {
  booking: BookingAgendaItem;
  orgSlug: string;
  providerName: string | undefined;
  timezone: string;
}) {
  return (
    <Link
      className={`${FOCUS} hover:bg-muted active:bg-muted grid min-h-14 gap-2 rounded-2xl p-3 transition-colors duration-[120ms] md:grid-cols-[13rem_1fr_auto] md:items-center`}
      href={{ pathname: `/studio/${orgSlug}/bookings/${booking.id}` }}
    >
      <span className="text-foreground font-semibold">
        {formatTime(booking.starts_at, timezone)} to{" "}
        {formatTime(booking.ends_at, timezone)}
      </span>
      <span className="min-w-0">
        <span className="text-foreground block font-medium break-words">
          {booking.customer_name}
        </span>
        <span className="text-foreground/80 block text-sm">
          {booking.service_name}
          {providerName ? ` with ${providerName}` : ""}
          {`, ${formatMoney(booking.price_minor, booking.currency)}`}
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        <StatusBadge kind={booking.payment_kind} status={booking.status} />
        {booking.deposit_minor > 0 ? (
          <DepositBadge view={agendaDepositView(booking)} />
        ) : null}
      </span>
    </Link>
  );
}
