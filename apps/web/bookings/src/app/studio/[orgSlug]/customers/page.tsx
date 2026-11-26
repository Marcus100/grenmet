import { PageHeader } from "@barrelsgd/admin-kit/components/page-header";
import type { BookingCustomerListItem } from "@barrelsgd/api-client";
import {
  formatDateTime,
  formatDay,
  localDay,
} from "@barrelsgd/bookings-web/lib/booking-format";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { StudioAlert } from "@/components/studio/studio-alert";
import {
  CARD,
  CARD_LINK,
  FOCUS,
  PRIMARY_ACTION,
  SECONDARY_ACTION,
} from "@/components/studio/studio-ui";
import { telHref } from "@/lib/phone";
import { requireSession } from "@/lib/session";
import { listCustomers } from "@/lib/studio-api";
import type { StudioFailure } from "@/lib/studio-errors";
import { guarded, loadOrganisation } from "@/lib/studio-page";
import { loadBusinessProfile } from "@/lib/studio-pending";

export const metadata: Metadata = {
  title: "Customers",
};

/** The API's own limit for a search. */
const MAX_SEARCH = 100;

interface CustomersPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.trim() || undefined;
}

/** The shared failure wording speaks of the agenda; this page has its own. */
function customersFailure(failure: StudioFailure): StudioFailure {
  if (failure.kind === "unavailable") {
    return {
      ...failure,
      message: "The customers list is not available right now.",
    };
  }
  if (failure.kind === "invalid") {
    return {
      ...failure,
      message: "That search is not valid.",
      nextStep: "Try a shorter name, email or phone number.",
    };
  }
  if (failure.kind === "not_found") {
    return { ...failure, nextStep: "Go back to the agenda and try again." };
  }
  return failure;
}

/** People who have booked with the business, whoever is coming next first. */
export default async function CustomersPage({
  params,
  searchParams,
}: CustomersPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const here = `/studio/${orgSlug}/customers`;
  // The search is never part of the return address: it is personal data.
  const session = await requireSession(here);

  const search = first(query.q)?.slice(0, MAX_SEARCH);
  const offsetParam = Number(first(query.offset));
  const offset =
    Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;

  const org = await loadOrganisation(session, orgSlug, here);
  if (!org.ok) {
    return <StudioAlert backHref="/studio" failure={org.failure} />;
  }
  const organisationId = org.value.id;

  const [profile, customers] = await Promise.all([
    guarded(
      () => loadBusinessProfile(session.accessToken, organisationId),
      here
    ),
    guarded(
      () =>
        listCustomers(session.accessToken, organisationId, { offset, search }),
      here
    ),
  ]);
  if (!profile.ok) {
    return <StudioAlert backHref="/studio" failure={profile.failure} />;
  }

  const link = (nextOffset: number) => ({
    pathname: here,
    query: {
      ...(search ? { q: search } : {}),
      ...(nextOffset > 0 ? { offset: String(nextOffset) } : {}),
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        description="Everyone who has booked with you. Whoever is coming next is first."
        title="Customers"
      />

      <search>
        <form
          action={here}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          method="get"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <Label className="font-medium" htmlFor="customer-search">
              Search by name, email or phone
            </Label>
            <Input
              autoComplete="off"
              className="h-11"
              defaultValue={search ?? ""}
              enterKeyHint="search"
              id="customer-search"
              maxLength={MAX_SEARCH}
              name="q"
              type="search"
            />
          </div>
          <button className={PRIMARY_ACTION} type="submit">
            Search
          </button>
          {search ? (
            <Link className={SECONDARY_ACTION} href={{ pathname: here }}>
              Clear search
            </Link>
          ) : null}
        </form>
      </search>

      {customers.ok ? (
        <CustomerList
          customers={customers.value.customers}
          nextHref={
            offset + customers.value.limit < customers.value.total
              ? link(offset + customers.value.limit)
              : null
          }
          offset={offset}
          previousHref={
            offset > 0
              ? link(Math.max(0, offset - customers.value.limit))
              : null
          }
          search={search}
          timezone={profile.value.timezone}
          total={customers.value.total}
        />
      ) : (
        <StudioAlert
          backHref={here}
          backLabel="Reload the customers list"
          failure={customersFailure(customers.failure)}
        />
      )}
    </div>
  );
}

interface Href {
  pathname: string;
  query: Record<string, string>;
}

function CustomerList({
  customers,
  nextHref,
  offset,
  previousHref,
  search,
  timezone,
  total,
}: {
  customers: BookingCustomerListItem[];
  nextHref: Href | null;
  offset: number;
  previousHref: Href | null;
  search: string | undefined;
  timezone: string;
  total: number;
}) {
  if (customers.length === 0) {
    return (
      <section className={`${CARD} space-y-2`}>
        <p className="text-foreground">{emptyText(search, total)}</p>
        {previousHref ? (
          <Link className={CARD_LINK} href={previousHref}>
            Previous customers
          </Link>
        ) : null}
      </section>
    );
  }

  const noun = total === 1 ? "customer" : "customers";
  return (
    <div className="space-y-4">
      <p className="text-foreground/80 text-sm" role="status">
        {total > customers.length
          ? `Showing ${offset + 1} to ${offset + customers.length} of ${total} ${noun}`
          : `${total} ${noun}`}
      </p>
      <ul className={cn(CARD, "divide-border divide-y p-2 sm:p-3")}>
        {customers.map((customer) => (
          <li key={customer.id}>
            <CustomerRow customer={customer} timezone={timezone} />
          </li>
        ))}
      </ul>
      {previousHref || nextHref ? (
        <nav aria-label="More customers" className="flex flex-wrap gap-2">
          {previousHref ? (
            <Link className={SECONDARY_ACTION} href={previousHref}>
              Previous customers
            </Link>
          ) : null}
          {nextHref ? (
            <Link className={SECONDARY_ACTION} href={nextHref}>
              More customers
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function emptyText(search: string | undefined, total: number): string {
  if (search) {
    return `No customers match "${search}".`;
  }
  // A page past the end of a list that has customers.
  if (total > 0) {
    return "No more customers.";
  }
  return "No customers yet. They appear here after their first booking.";
}

/**
 * One customer. A phone stacks name, contact and the three facts; from `md`
 * up they sit in columns. Each fact keeps its label at every width.
 */
function CustomerRow({
  customer,
  timezone,
}: {
  customer: BookingCustomerListItem;
  timezone: string;
}) {
  const call = telHref(customer.phone);
  return (
    <div className="grid min-h-14 gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] md:gap-4">
      <div className="min-w-0">
        <h2 className="text-foreground font-semibold break-words">
          {customer.name || "No name given"}
        </h2>
        {customer.returning ? (
          <p className="text-foreground/80 text-sm">Returning customer</p>
        ) : null}
      </div>
      <div className="min-w-0 text-sm">
        {customer.phone ? (
          <p>
            {call ? (
              <a
                aria-label={`Call ${customer.phone}`}
                className={cn(
                  FOCUS,
                  "text-primary -my-1 inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                )}
                href={call}
              >
                {customer.phone}
              </a>
            ) : (
              <span className="text-foreground break-words">
                {customer.phone}
              </span>
            )}
          </p>
        ) : null}
        {customer.email ? (
          <p className="text-foreground break-all">{customer.email}</p>
        ) : null}
        {customer.phone || customer.email ? null : (
          <p className="text-foreground/80">No contact details</p>
        )}
      </div>
      <dl className="text-foreground grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-foreground/80">Bookings</dt>
        <dd className="font-medium">{customer.bookings_count}</dd>
        <dt className="text-foreground/80">Last visit</dt>
        <dd>
          {customer.last_visit_at
            ? formatDay(localDay(customer.last_visit_at, timezone), true)
            : "None yet"}
        </dd>
        <dt className="text-foreground/80">Next booking</dt>
        <dd>
          {customer.next_booking_at
            ? formatDateTime(customer.next_booking_at, timezone)
            : "Nothing booked"}
        </dd>
      </dl>
    </div>
  );
}
