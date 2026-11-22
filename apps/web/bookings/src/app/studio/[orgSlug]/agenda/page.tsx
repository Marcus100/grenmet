import type { BookingAgendaItem } from "@barrelsgd/api-client";
import {
  formatDay,
  formatMoney,
  formatTime,
} from "@barrelsgd/bookings-web/lib/booking-format";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { DepositBadge, StatusBadge } from "@/components/studio/badges";
import { BookingAddress } from "@/components/studio/booking-address";
import { StudioAlert } from "@/components/studio/studio-alert";
import { env } from "@/env";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";
import { getAgenda, getBusinessProfile, listProviders } from "@/lib/studio-api";
import { guarded, loadOrganisation } from "@/lib/studio-page";
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
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 font-medium";

function pill(active: boolean): string {
  return cn(
    CONTROL,
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-foreground hover:bg-muted"
  );
}

/** The day and week controls share one row on a phone: narrower padding, still 44 px tall. */
function compactPill(active: boolean): string {
  return cn(
    "border-border inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-medium",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-foreground hover:bg-muted"
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
    () => getBusinessProfile(session.accessToken, organisationId),
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

  const [agenda, providers] = await Promise.all([
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
  ]);

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
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">{org.value.name}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Agenda</h1>
          {canManageBookings(org.value.role) ? (
            <Link
              className={pill(true)}
              href={{ pathname: `/studio/${orgSlug}/bookings/new` }}
            >
              New booking
            </Link>
          ) : null}
        </div>
      </header>

      {publicSlug ? (
        <BookingAddress
          orgSlug={orgSlug}
          publicSlug={publicSlug}
          siteOrigin={env.NEXT_PUBLIC_SITE_URL}
        />
      ) : (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          Your booking page has no address yet.{" "}
          <Link
            className="text-foreground inline-flex min-h-11 items-center font-medium underline underline-offset-4"
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

      <h2 className="text-lg font-semibold">{rangeLabel(range)}</h2>

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
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>
            {range.view === "day"
              ? `No bookings on ${formatDay(range.day, true)}`
              : "No bookings this week"}
          </EmptyTitle>
          <EmptyDescription>
            Bookings made on your booking page appear here as they come in. Try
            another {range.view === "day" ? "day" : "week"}, or choose All
            providers if a filter is on.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            href={emptyLink.href}
          >
            {emptyLink.label}
          </Link>
        </EmptyContent>
      </Empty>
    ) : null;

  if (emptyNote && range.view === "day") {
    return emptyNote;
  }

  const shown = range.view === "week" ? daysIn(range) : [range.day];
  const paging =
    allMatching > total || previousHref ? (
      <p className="flex flex-wrap items-center gap-3" role="status">
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
              <h3 className="mb-2 font-semibold" id={`day-${day}`}>
                {formatDay(day, true)}
                {day === today ? " (today)" : ""}
              </h3>
            ) : null}
            {bookings.length === 0 ? (
              <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4">
                No bookings.
              </p>
            ) : (
              <ul className="space-y-2">
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
      className="border-border hover:bg-muted grid min-h-11 gap-2 rounded-lg border p-4 md:grid-cols-[13rem_1fr_auto] md:items-center"
      href={{ pathname: `/studio/${orgSlug}/bookings/${booking.id}` }}
    >
      <span className="font-semibold">
        {formatTime(booking.starts_at, timezone)} to{" "}
        {formatTime(booking.ends_at, timezone)}
      </span>
      <span className="min-w-0">
        <span className="block font-medium break-words">
          {booking.customer_name}
        </span>
        <span className="text-muted-foreground block text-sm">
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
