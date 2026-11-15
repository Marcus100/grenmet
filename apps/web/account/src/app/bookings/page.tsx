import type { BookingMyBookingList } from "@barrelsgd/api-client";
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

/** Query parameters: each section's page number. */
const UPCOMING_PARAM = "upcoming_page";
const PAST_PARAM = "past_page";
/**
 * Set on the return trip of a sign-in that this page started after a 401. If
 * the API refuses again, the page says so instead of sending the person round
 * the sign-in loop once more.
 */
const REAUTH_PARAM = "reauth";
const SECTION_PAGE_SIZE = 20;
const PAST_PAGE_SIZE = 10;
/** The API's largest page number. */
const MAX_PAGE = 1_000_000;

const SIGN_IN_AGAIN_RETURN = `/bookings?${REAUTH_PARAM}=1`;

interface MyBookingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type SectionLoad =
  | { ok: true; list: BookingMyBookingList }
  | { ok: false; reason: "refused" | "failed" };

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
 * One section's bookings. A 401 sends the person to sign in once, with the
 * reauth marker in the return target. A 401 that arrives after that sign-in
 * is shown inline instead, so the page cannot loop. Other 4xx are shown inline
 * without a report; anything else (server or network failure, unreadable body)
 * is reported.
 */
async function loadSection(
  accessToken: string,
  query: MyBookingsQuery,
  afterReauth: boolean
): Promise<SectionLoad> {
  try {
    return { ok: true, list: await getMyBookings(accessToken, query) };
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      if (!afterReauth) {
        redirect(
          `/signin?${new URLSearchParams({ returnTo: SIGN_IN_AGAIN_RETURN })}`
        );
      }
      return { ok: false, reason: "refused" };
    }
    if (isAuthApiError(error) && error.status >= 400 && error.status < 500) {
      return { ok: false, reason: "refused" };
    }
    reportError(error, "account-my-bookings");
    return { ok: false, reason: "failed" };
  }
}

function failureSentence(
  section: "upcoming" | "past",
  reason: "refused" | "failed",
  afterReauth: boolean
): string {
  if (afterReauth && reason === "refused") {
    return "We could not load your bookings. Try again later.";
  }
  return `Your ${section} bookings could not be loaded just now. Refresh the page to try again.`;
}

/**
 * The signed-in person's bookings with every business: upcoming (soonest first,
 * as the API orders them) and past (newest first). Both are paged and each
 * section fails on its own.
 */
export default async function MyBookingsPage({
  searchParams,
}: MyBookingsPageProps) {
  const session = await requireSession("/bookings");
  const params = await searchParams;
  const afterReauth = first(params[REAUTH_PARAM]) === "1";
  const upcomingPage = parsePage(first(params[UPCOMING_PARAM]));
  const pastPage = parsePage(first(params[PAST_PARAM]));

  const [upcoming, past] = await Promise.all([
    loadSection(
      session.accessToken,
      { upcoming: true, page: upcomingPage, size: SECTION_PAGE_SIZE },
      afterReauth
    ),
    loadSection(
      session.accessToken,
      { upcoming: false, page: pastPage, size: PAST_PAGE_SIZE },
      afterReauth
    ),
  ]);
  const bookingsBaseUrl = env.BOOKINGS_APP_URL;
  const upcomingKeep: Record<string, string> =
    pastPage > 1 ? { [PAST_PARAM]: String(pastPage) } : {};
  const pastKeep: Record<string, string> =
    upcomingPage > 1 ? { [UPCOMING_PARAM]: String(upcomingPage) } : {};

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
              bookings={upcoming.list.data}
              bookingsBaseUrl={bookingsBaseUrl}
              emptyBody="Bookings you make while signed in appear here."
              emptyTitle={
                upcomingPage > 1
                  ? "No upcoming bookings on this page"
                  : "No upcoming bookings"
              }
            />
            <ListPager
              keep={upcomingKeep}
              page={upcomingPage}
              pageCount={Math.max(
                1,
                Math.ceil(upcoming.list.count / SECTION_PAGE_SIZE)
              )}
              pageParam={UPCOMING_PARAM}
            />
          </>
        ) : (
          <p className="text-muted-foreground" role="alert">
            {failureSentence("upcoming", upcoming.reason, afterReauth)}
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
              keep={pastKeep}
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
            {failureSentence("past", past.reason, afterReauth)}
          </p>
        )}
      </section>
    </main>
  );
}
