// The three lists on My bookings. Each tab reads one filtered list from the API:
// Upcoming leaves cancelled bookings out, so a cancelled booking never shows there.

export const VIEW_PARAM = "view";
export const PAGE_PARAM = "page";

export type BookingView = "upcoming" | "past" | "cancelled";

export interface BookingTab {
  emptyBody: string;
  /** Shown on a later page that has no rows. */
  emptyPageTitle: string;
  emptyTitle: string;
  /** The section heading above the list. */
  heading: string;
  key: BookingView;
  label: string;
  /** Names the list in the sentence shown when it cannot be loaded. */
  name: string;
  /** The API filters for this tab (`upcoming`, `cancelled`); undefined leaves it out. */
  query: { cancelled: boolean | undefined; upcoming: boolean | undefined };
}

const TABS: Record<BookingView, BookingTab> = {
  upcoming: {
    key: "upcoming",
    label: "Upcoming",
    heading: "Upcoming bookings",
    name: "upcoming",
    query: { cancelled: false, upcoming: true },
    emptyTitle: "No upcoming bookings",
    emptyBody:
      "Bookings you make while signed in appear here, soonest first. Open a business's booking page to book one.",
    emptyPageTitle: "No upcoming bookings on this page",
  },
  past: {
    key: "past",
    label: "Past",
    heading: "Past bookings",
    name: "past",
    query: { cancelled: false, upcoming: false },
    emptyTitle: "No past bookings yet",
    emptyBody:
      "Appointments that have finished, and ones you missed, appear here once their time has passed.",
    emptyPageTitle: "No past bookings on this page",
  },
  cancelled: {
    key: "cancelled",
    label: "Cancelled",
    heading: "Cancelled bookings",
    name: "cancelled",
    query: { cancelled: true, upcoming: undefined },
    emptyTitle: "No cancelled bookings",
    emptyBody:
      "Bookings you cancel, requests a business declined, and unpaid holds that ran out appear here. Nothing here needs action.",
    emptyPageTitle: "No cancelled bookings on this page",
  },
};

/** The tabs in the order they are shown. */
export const BOOKING_TABS: readonly BookingTab[] = [
  TABS.upcoming,
  TABS.past,
  TABS.cancelled,
];

/** The tab for a `view` parameter; anything unknown is the Upcoming tab. */
export function tabFor(raw: string | undefined): BookingTab {
  switch (raw) {
    case "past":
      return TABS.past;
    case "cancelled":
      return TABS.cancelled;
    default:
      return TABS.upcoming;
  }
}
