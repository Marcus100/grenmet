import type {
  BookingMyBooking,
  BookingMyBookingList,
} from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account-nav";
import { BookingList } from "@/components/my-bookings/booking-list";
import { ListPager } from "@/components/my-bookings/list-pager";
import { env } from "@/env";
import { getMyBookings, type MyBookingsQuery } from "@/lib/my-bookings-api";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "My bookings",
};

export const dynamic = "force-dynamic";

/** Query parameter for the past list's page number. */
const PAST_PARAM = "past_page";
const PAST_PAGE_SIZE = 10;
/**
 * The API's largest page. It lists newest first, so a smaller page for upcoming
 * bookings would leave out the soonest ones.
 */
const UPCOMING_SIZE = 1000;
/** The API's largest page number. */
const MAX_PAGE = 1_000_000;

interface MyBookingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type SectionLoad = { ok: true; list: BookingMyBookingList } | { ok: false };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A page number from the URL; anything that is not a whole number is page 1. */
function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/**
 * One section's bookings. A 401 means the session ended, so the person signs in
 * again, as the other pages do. Any other 4xx is shown inline without a report;
 * anything else (server or network failure, unreadable body) is reported.
 */
async function loadSection(
  accessToken: string,
  query: MyBookingsQuery
): Promise<SectionLoad> {
  try {
    return { ok: true, list: await getMyBookings(accessToken, query) };
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      redirect(`/signin?${new URLSearchParams({ returnTo: "/bookings" })}`);
    }
    if (!(isAuthApiError(error) && error.status >= 400 && error.status < 500)) {
      reportError(error, "account-my-bookings");
    }
    return { ok: false };
  }
}

function sortSoonestFirst(
  rows: readonly BookingMyBooking[]
): BookingMyBooking[] {
  return [...rows].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)
  );
}

/**
 * The signed-in person's bookings with every business: upcoming (soonest first)
 * and past (newest first, paged). Each section fails on its own.
 */
export default async function MyBookingsPage({
  searchParams,
}: MyBookingsPageProps) {
  const session = await requireSession("/bookings");
  const params = await searchParams;
  const pastPage = parsePage(first(params[PAST_PARAM]));

  const [upcoming, past] = await Promise.all([
    loadSection(session.accessToken, { upcoming: true, size: UPCOMING_SIZE }),
    loadSection(session.accessToken, {
      upcoming: false,
      page: pastPage,
      size: PAST_PAGE_SIZE,
    }),
  ]);
  const bookingsBaseUrl = env.BOOKINGS_APP_URL;

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6"
      id="main-content"
    >
      <AccountNav current="bookings" />
      <header className="min-w-0 space-y-1">
        <p className="text-muted-foreground text-sm font-medium">
          Barrels account
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
      </header>

      <section aria-labelledby="upcoming-heading" className="space-y-4">
        <h2 className="text-lg font-semibold" id="upcoming-heading">
          Upcoming
        </h2>
        {upcoming.ok ? (
          <>
            <BookingList
              bookings={sortSoonestFirst(upcoming.list.data)}
              bookingsBaseUrl={bookingsBaseUrl}
              emptyBody="Bookings you make while signed in appear here."
              emptyTitle="No upcoming bookings"
            />
            {upcoming.list.count > upcoming.list.data.length ? (
              <p className="text-muted-foreground text-sm">
                Only the first {upcoming.list.data.length} of{" "}
                {upcoming.list.count} upcoming bookings are listed.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground" role="alert">
            Your upcoming bookings could not be loaded just now. Refresh the
            page to try again.
          </p>
        )}
      </section>

      <section aria-labelledby="past-heading" className="space-y-4">
        <h2 className="text-lg font-semibold" id="past-heading">
          Past
        </h2>
        {past.ok ? (
          <>
            <BookingList
              bookings={past.list.data}
              bookingsBaseUrl={bookingsBaseUrl}
              emptyBody="Bookings you make while signed in appear here."
              emptyTitle={
                pastPage > 1
                  ? "No past bookings on this page"
                  : "No past bookings"
              }
            />
            <ListPager
              page={pastPage}
              pageCount={Math.max(
                1,
                Math.ceil(past.list.count / PAST_PAGE_SIZE)
              )}
              pageParam={PAST_PARAM}
            />
          </>
        ) : (
          <p className="text-muted-foreground" role="alert">
            Your past bookings could not be loaded just now. Refresh the page to
            try again.
          </p>
        )}
      </section>
    </main>
  );
}
