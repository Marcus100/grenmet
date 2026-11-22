import type { BookingMyBookingList } from "@barrelsgd/api-client";
import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account-nav";
import { BookingList } from "@/components/my-bookings/booking-list";
import { BookingTabs } from "@/components/my-bookings/booking-tabs";
import { ListPager } from "@/components/my-bookings/list-pager";
import { env } from "@/env";
import {
  type BookingTab,
  PAGE_PARAM,
  tabFor,
  VIEW_PARAM,
} from "@/lib/booking-tabs";
import { getMyBookings, type MyBookingsQuery } from "@/lib/my-bookings-api";
import { reportError } from "@/lib/report-error";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "My bookings",
};

export const dynamic = "force-dynamic";

/**
 * Set on the return trip of a sign-in that this page started after a 401. If
 * the API refuses again, the page says so instead of sending the person round
 * the sign-in loop once more.
 */
const REAUTH_PARAM = "reauth";
const PAGE_SIZE = 20;
/** The API's largest page number. */
const MAX_PAGE = 1_000_000;

interface MyBookingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ListLoad =
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
 * One tab's bookings. A 401 sends the person to sign in once, with the reauth
 * marker in the return target. A 401 that arrives after that sign-in is shown
 * inline instead, so the page cannot loop. Other 4xx are shown inline without a
 * report; anything else (server or network failure, unreadable body) is reported.
 */
async function loadList(
  accessToken: string,
  query: MyBookingsQuery,
  afterReauth: boolean,
  returnTo: string
): Promise<ListLoad> {
  try {
    return { ok: true, list: await getMyBookings(accessToken, query) };
  } catch (error) {
    if (isAuthApiError(error) && error.status === 401) {
      if (!afterReauth) {
        redirect(`/signin?${new URLSearchParams({ returnTo })}`);
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
  tab: BookingTab,
  reason: "refused" | "failed",
  afterReauth: boolean
): string {
  if (afterReauth && reason === "refused") {
    return "We could not load your bookings. Try again later.";
  }
  return `Your ${tab.name} bookings could not be loaded just now. Refresh the page to try again.`;
}

/**
 * The signed-in person's bookings with every business, one list per tab:
 * Upcoming (soonest first), Past (newest first) and Cancelled. A cancelled
 * booking is listed under Cancelled only. Each row links to its manage page.
 */
export default async function MyBookingsPage({
  searchParams,
}: MyBookingsPageProps) {
  const params = await searchParams;
  const tab = tabFor(first(params[VIEW_PARAM]));
  const page = parsePage(first(params[PAGE_PARAM]));
  const afterReauth = first(params[REAUTH_PARAM]) === "1";
  const session = await requireSession(
    `/bookings?${new URLSearchParams({ [VIEW_PARAM]: tab.key, [PAGE_PARAM]: String(page) })}`
  );
  const returnTo = `/bookings?${new URLSearchParams({
    [VIEW_PARAM]: tab.key,
    [REAUTH_PARAM]: "1",
  })}`;

  const load = await loadList(
    session.accessToken,
    { ...tab.query, page, size: PAGE_SIZE },
    afterReauth,
    returnTo
  );
  const bookingsBaseUrl = env.BOOKINGS_APP_URL;

  return (
    <main
      className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-8 p-6"
      id="main-content"
    >
      <AccountNav current="bookings" />
      <header className="min-w-0 space-y-1">
        <p className="text-muted-foreground text-sm font-medium">
          Barrels account
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
      </header>

      <BookingTabs current={tab.key} />

      <section aria-labelledby="list-heading" className="min-w-0 space-y-4">
        <h2 className="text-lg font-semibold" id="list-heading">
          {tab.heading}
        </h2>
        {load.ok ? (
          <>
            <BookingList
              bookings={load.list.data}
              bookingsBaseUrl={bookingsBaseUrl}
              emptyBody={tab.emptyBody}
              emptyTitle={page > 1 ? tab.emptyPageTitle : tab.emptyTitle}
            />
            <ListPager
              keep={{ [VIEW_PARAM]: tab.key }}
              page={page}
              pageCount={Math.max(1, Math.ceil(load.list.count / PAGE_SIZE))}
              pageParam={PAGE_PARAM}
            />
          </>
        ) : (
          <p className="text-muted-foreground" role="alert">
            {failureSentence(tab, load.reason, afterReauth)}
          </p>
        )}
      </section>
    </main>
  );
}
