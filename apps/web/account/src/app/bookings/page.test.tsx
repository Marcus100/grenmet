import { render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { reportError } from "@/lib/report-error";
import MyBookingsPage from "./page";

const JANUARY_2030_END = /January 2030$/u;
const MANAGE_ROW_NAME =
  /Manage booking, Bridal makeup with Babydoll Beauty Bar/u;
const MANAGE_LINK_NAME = /Manage booking/u;
const CUT_OFF_NOTICE = /Only the first/u;
const UPCOMING_GUIDE = /Open a business's booking page to book one\./u;
const PAST_EMPTY_BODY = /Appointments that have finished/u;
const CANCELLED_EMPTY_BODY = /requests a business declined, and unpaid holds/u;

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok-1",
    email: "person@example.com",
    name: null,
    userId: "11111111-1111-4111-8111-111111111111",
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

const API = "http://localhost:8000/api/v1/bookings/me/bookings";
const BOOKINGS_BASE = "http://localhost:3015";
const MANAGE_BASE = "http://localhost:3015/babydoll/booking";

/** Ids must be UUIDs: the generated Zod schema checks them. */
function row(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    status: "confirmed",
    starts_at: "2030-01-10T15:00:00Z",
    ends_at: "2030-01-10T16:00:00Z",
    service_name: "Bridal makeup",
    business_name: "Babydoll Beauty Bar",
    business_slug: "babydoll",
    payment: null,
    manage_url: `${MANAGE_BASE}/tok-${suffix}`,
    ...overrides,
  };
}

function list(data: unknown[], count = data.length, page = 1) {
  return { data, count, page, size: 20 };
}

const server = setupServer();
/** Replies keyed by the tab the request is for. */
type Tab = "upcoming" | "past" | "cancelled";
let replies: Record<Tab, () => Response>;
let requested: URL[] = [];

/** The tab a list request is for, from its filters (see `booking-tabs.ts`). */
function tabOf(url: URL): Tab {
  if (url.searchParams.get("cancelled") === "true") return "cancelled";
  return url.searchParams.get("upcoming") === "true" ? "upcoming" : "past";
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  requested = [];
  replies = {
    upcoming: () => HttpResponse.json(list([])),
    past: () => HttpResponse.json(list([])),
    cancelled: () => HttpResponse.json(list([])),
  };
  server.use(
    http.get(API, ({ request }) => {
      const url = new URL(request.url);
      requested.push(url);
      return replies[tabOf(url)]();
    })
  );
});
afterEach(() => {
  server.resetHandlers();
  vi.mocked(reportError).mockClear();
});

async function renderPage(searchParams: Record<string, string> = {}) {
  const element = await MyBookingsPage({
    searchParams: Promise.resolve(searchParams),
  });
  render(element);
}

describe("My bookings page", () => {
  it("shows three tabs and marks the one on screen", async () => {
    await renderPage({ view: "past" });
    const tabs = screen.getByRole("navigation", { name: "Booking lists" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((l) => l.textContent)
    ).toEqual(["Upcoming", "Past", "Cancelled"]);
    expect(within(tabs).getByRole("link", { name: "Past" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      within(tabs).getByRole("link", { name: "Upcoming" })
    ).not.toHaveAttribute("aria-current");
    expect(
      within(tabs).getByRole("link", { name: "Cancelled" })
    ).toHaveAttribute("href", "/bookings?view=cancelled");
  });

  it("opens the Upcoming tab when no or an unknown view is asked for", async () => {
    await renderPage({ view: "nonsense" });
    expect(requested).toHaveLength(1);
    expect(tabOf(requested[0] ?? new URL(API))).toBe("upcoming");
    expect(
      screen.getByRole("heading", { level: 2, name: "Upcoming bookings" })
    ).toBeInTheDocument();
  });

  it("asks for only the list on screen, with the filter that keeps cancelled bookings out of Upcoming", async () => {
    await renderPage({ view: "upcoming" });
    expect(requested).toHaveLength(1);
    const [upcoming] = requested;
    expect(upcoming?.searchParams.get("upcoming")).toBe("true");
    expect(upcoming?.searchParams.get("cancelled")).toBe("false");
    expect(upcoming?.searchParams.get("size")).toBe("20");
    expect(upcoming?.searchParams.get("page")).toBe("1");
  });

  it("asks for past bookings without cancelled ones, and for cancelled bookings alone", async () => {
    await renderPage({ view: "past", page: "2" });
    const [past] = requested;
    expect(past?.searchParams.get("upcoming")).toBe("false");
    expect(past?.searchParams.get("cancelled")).toBe("false");
    expect(past?.searchParams.get("page")).toBe("2");
  });

  it("asks for the cancelled tab with cancelled=true and no upcoming filter", async () => {
    replies.cancelled = () =>
      HttpResponse.json(list([row("000000000009", { status: "cancelled" })]));
    await renderPage({ view: "cancelled" });
    const [cancelled] = requested;
    expect(cancelled?.searchParams.get("cancelled")).toBe("true");
    expect(cancelled?.searchParams.has("upcoming")).toBe(false);
    expect(
      within(
        screen.getByRole("region", { name: "Cancelled bookings" })
      ).getByText("Cancelled")
    ).toBeInTheDocument();
  });

  it("keeps the API order inside the list (soonest first for upcoming)", async () => {
    replies.upcoming = () =>
      HttpResponse.json(
        list([
          row("000000000002", {
            starts_at: "2030-01-02T15:00:00Z",
            ends_at: "2030-01-02T16:00:00Z",
            business_name: "Sooner Co",
          }),
          row("000000000001", {
            starts_at: "2030-03-01T15:00:00Z",
            ends_at: "2030-03-01T16:00:00Z",
            business_name: "Later Co",
          }),
        ])
      );
    await renderPage({ view: "upcoming" });
    const upcoming = screen.getByRole("region", {
      name: "Upcoming bookings",
    });
    expect(
      within(upcoming)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      expect.stringContaining("Sooner Co"),
      expect.stringContaining("Later Co"),
    ]);
  });

  it("groups the rows under the day they start", async () => {
    replies.upcoming = () =>
      HttpResponse.json(
        list([
          row("000000000001", {
            starts_at: "2030-01-10T15:00:00Z",
            ends_at: "2030-01-10T16:00:00Z",
          }),
          row("000000000002", {
            starts_at: "2030-01-10T16:00:00Z",
            ends_at: "2030-01-10T17:00:00Z",
          }),
          row("000000000003", {
            starts_at: "2030-01-12T15:00:00Z",
            ends_at: "2030-01-12T16:00:00Z",
          }),
        ])
      );
    await renderPage({ view: "upcoming" });
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(2);
    const [first, second] = headings;
    expect(first?.textContent).toMatch(JANUARY_2030_END);
    expect(second?.textContent).toMatch(JANUARY_2030_END);
    const firstGroup = first?.closest("section");
    expect(firstGroup).not.toBeNull();
    expect(
      within(firstGroup as HTMLElement).getAllByRole("listitem")
    ).toHaveLength(2);
  });

  it("links each row to its manage page, and keeps the business page one link away", async () => {
    replies.upcoming = () => HttpResponse.json(list([row("000000000005")]));
    await renderPage({ view: "upcoming" });
    expect(
      screen.getByRole("link", {
        name: MANAGE_ROW_NAME,
      })
    ).toHaveAttribute("href", `${MANAGE_BASE}/tok-000000000005`);
    expect(
      screen.getByRole("link", {
        name: "Business page, Babydoll Beauty Bar",
      })
    ).toHaveAttribute("href", `${BOOKINGS_BASE}/babydoll`);
  });

  it("falls back to the business page when a row has no manage link", async () => {
    replies.past = () =>
      HttpResponse.json(list([row("000000000006", { manage_url: null })]));
    await renderPage({ view: "past" });
    expect(screen.queryByRole("link", { name: MANAGE_LINK_NAME })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Babydoll Beauty Bar" })
    ).toHaveAttribute("href", `${BOOKINGS_BASE}/babydoll`);
  });

  it("pages the list and keeps the tab in the page links", async () => {
    replies.upcoming = () =>
      HttpResponse.json(list([row("000000000005")], 45, 2));
    await renderPage({ view: "upcoming", page: "2" });
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/bookings?view=upcoming"
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/bookings?view=upcoming&page=3"
    );
  });

  it("has no notice about a cut-off list", async () => {
    replies.upcoming = () => HttpResponse.json(list([row("000000000005")], 45));
    await renderPage({ view: "upcoming" });
    expect(screen.queryByText(CUT_OFF_NOTICE)).toBeNull();
  });

  it("guides people with an empty state for each tab", async () => {
    await renderPage({ view: "upcoming" });
    expect(screen.getByText("No upcoming bookings")).toBeInTheDocument();
    expect(screen.getByText(UPCOMING_GUIDE)).toBeInTheDocument();
  });

  it("explains the empty Past and Cancelled tabs", async () => {
    await renderPage({ view: "past" });
    expect(screen.getByText("No past bookings yet")).toBeInTheDocument();
    expect(screen.getByText(PAST_EMPTY_BODY)).toBeInTheDocument();
  });

  it("explains the empty Cancelled tab", async () => {
    await renderPage({ view: "cancelled" });
    expect(screen.getByText("No cancelled bookings")).toBeInTheDocument();
    expect(screen.getByText(CANCELLED_EMPTY_BODY)).toBeInTheDocument();
  });

  it("says when an empty page is past the last page", async () => {
    replies.past = () => HttpResponse.json(list([], 25, 9));
    await renderPage({ view: "past", page: "9" });
    expect(
      screen.getByText("No past bookings on this page")
    ).toBeInTheDocument();
  });

  it("shows a failed load inline and reports a 500", async () => {
    replies.upcoming = () => new HttpResponse(null, { status: 500 });
    await renderPage({ view: "upcoming" });
    const upcoming = screen.getByRole("region", {
      name: "Upcoming bookings",
    });
    expect(within(upcoming).getByRole("alert")).toHaveTextContent(
      "Your upcoming bookings could not be loaded just now."
    );
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      "account-my-bookings"
    );
  });

  it("shows a refused past load inline and does not report a 403", async () => {
    replies.past = () => HttpResponse.json({ detail: "No." }, { status: 403 });
    await renderPage({ view: "past" });
    const past = screen.getByRole("region", { name: "Past bookings" });
    expect(within(past).getByRole("alert")).toHaveTextContent(
      "Your past bookings could not be loaded just now."
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("sends a first 401 to sign-in once, returning to the same tab with the reauth marker", async () => {
    replies.upcoming = () =>
      HttpResponse.json({ detail: "Gone." }, { status: 401 });
    await expect(renderPage({ view: "upcoming" })).rejects.toThrow(
      "REDIRECT /signin?returnTo=%2Fbookings%3Fview%3Dupcoming%26reauth%3D1"
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("shows the sign-in message after a 401 that followed a sign-in, without redirecting", async () => {
    replies.cancelled = () =>
      HttpResponse.json({ detail: "Gone." }, { status: 401 });
    await renderPage({ view: "cancelled", reauth: "1" });
    expect(
      within(
        screen.getByRole("region", { name: "Cancelled bookings" })
      ).getByRole("alert")
    ).toHaveTextContent("We could not load your bookings. Try again later.");
    expect(reportError).not.toHaveBeenCalled();
  });
});
