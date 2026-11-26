import type {
  BookingAgenda,
  BookingAgendaItem,
  BookingProviderPublic,
} from "@barrelsgd/api-client";
import { formatDay } from "@barrelsgd/bookings-web/lib/booking-format";
import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, PROVIDER_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getAgenda: vi.fn(),
  getBusinessProfile: vi.fn(),
  getProfile: vi.fn(),
  getSettings: vi.fn(),
  listProviders: vi.fn(),
}));
vi.mock("@/lib/studio-pending", () => ({
  loadBusinessProfile: (token: string, organisationId: string) =>
    getBusinessProfile(token, organisationId),
  loadPendingRequests: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import {
  findOrganisation,
  getAgenda,
  getBusinessProfile,
  getSettings,
  listProviders,
} from "@/lib/studio-api";
import { loadPendingRequests } from "@/lib/studio-pending";
import AgendaPage from "./page";

/** A business with nothing set up yet: every checklist step is open. */
const NOTHING_SET_UP = {
  profile: null,
  services: [],
  providers: [],
  deposits_available: false,
};

const params = Promise.resolve({ orgSlug: "sea-salt" });
/** The studio slug is "sea-salt"; customers book at a different public slug. */
const PUBLIC_SLUG = "sea-salt-spa";

function profile(
  timezone: string,
  publicSlug: string | null = PUBLIC_SLUG
): { currency: string; publicSlug: string | null; timezone: string } {
  return { currency: "XCD", publicSlug, timezone };
}
const search = (query: Record<string, string> = {}) => Promise.resolve(query);
const ADA = /Ada Lovelace/u;
const GRACE = /Grace Hopper/u;
const RETIRED = /with Retired Rae/u;
const CHECKLIST = /Complete your setup/u;
const BOOKING = "22222222-2222-4222-8222-222222222222";

function item(overrides: Partial<BookingAgendaItem> = {}): BookingAgendaItem {
  return {
    id: BOOKING,
    provider_id: PROVIDER_ID,
    service_id: "44444444-4444-4444-8444-444444444444",
    service_name: "Deep tissue massage",
    customer_id: "55555555-5555-4555-8555-555555555555",
    customer_name: "Ada Lovelace",
    starts_at: "2026-10-21T14:00:00Z",
    ends_at: "2026-10-21T15:30:00Z",
    status: "confirmed",
    source: "online",
    price_minor: 15_000,
    deposit_minor: 2500,
    payment_kind: "deposit",
    currency: "XCD",
    ...overrides,
  };
}

function agenda(days: BookingAgenda["days"]): BookingAgenda {
  return {
    timezone: "America/Grenada",
    from_date: "2026-10-19",
    to_date: "2026-10-25",
    total: days.length,
    limit: 500,
    offset: 0,
    days,
  };
}

function provider(
  id: string,
  name: string,
  active = true
): BookingProviderPublic {
  return { id, name, active, user_id: null, sort_order: 0, service_ids: [] };
}

beforeEach(() => {
  reportError.mockReset();
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: "sea-salt",
    role: "member",
  });
  vi.mocked(getAgenda).mockReset();
  vi.mocked(loadPendingRequests).mockReset();
  vi.mocked(loadPendingRequests).mockResolvedValue({
    ...agenda([]),
    total: 0,
  });
  vi.mocked(getSettings).mockReset();
  vi.mocked(getSettings).mockResolvedValue({
    ...NOTHING_SET_UP,
  } as never);
  vi.mocked(getBusinessProfile).mockResolvedValue(profile("America/Grenada"));
  vi.mocked(listProviders).mockResolvedValue([
    provider(PROVIDER_ID, "Maya"),
    provider("66666666-6666-4666-8666-666666666666", "Kofi"),
    provider("88888888-8888-4888-8888-888888888888", "Retired Rae", false),
  ]);
});

describe("setup checklist", () => {
  it("shows the open steps for an owner with nothing set up, each with a Do this link", async () => {
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "owner",
    });
    vi.mocked(getSettings).mockResolvedValue(NOTHING_SET_UP as never);
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.getByText(CHECKLIST)).toBeInTheDocument();
    expect(screen.getByText("0 of 5 steps done.")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Do this" });
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute("href", "/studio/sea-salt/services");
    expect(links[1]).toHaveAttribute("href", "/studio/sea-salt/settings#hours");
  });

  it("is not shown to a member, and its settings are not read", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.queryByText(CHECKLIST)).not.toBeInTheDocument();
    expect(getSettings).not.toHaveBeenCalled();
  });

  it("is not shown once every step is done", async () => {
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "admin",
    });
    vi.mocked(getSettings).mockResolvedValue({
      profile: {
        public_slug: "sea-salt-spa",
        enabled: true,
        brand_color: "#0b63ee",
        logo_file_id: null,
        payment_at_booking: "deposit",
      },
      services: [{ id: "s1" }],
      providers: [{ id: PROVIDER_ID, working_hours: [{}] }],
      deposits_available: false,
    } as never);
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.queryByText(CHECKLIST)).not.toBeInTheDocument();
  });

  it("is left out, without hiding the agenda, when the settings cannot be read", async () => {
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "owner",
    });
    vi.mocked(getSettings).mockRejectedValue(apiError(500));
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.queryByText(CHECKLIST)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
  });
});

describe("studio agenda", () => {
  it("defaults to today on the business's calendar, not the server's", async () => {
    // 02:30 UTC on 22 Oct is still the evening of 21 Oct in Grenada, but
    // already the 22nd in Auckland: the profile's zone must decide.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T02:30:00Z"));
    try {
      vi.mocked(getAgenda).mockResolvedValue(agenda([]));
      vi.mocked(getBusinessProfile).mockResolvedValue(
        profile("Pacific/Auckland")
      );
      render(await AgendaPage({ params, searchParams: search() }));
      expect(getAgenda).toHaveBeenLastCalledWith(
        "tok",
        ORG_ID,
        expect.objectContaining({ fromDate: "2026-10-22" })
      );
      cleanup();
      vi.mocked(getBusinessProfile).mockResolvedValue(
        profile("America/Grenada")
      );
      render(await AgendaPage({ params, searchParams: search() }));
      expect(getAgenda).toHaveBeenLastCalledWith(
        "tok",
        ORG_ID,
        expect.objectContaining({ fromDate: "2026-10-21" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("says what to do when the day is empty", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    expect(
      screen.getByText(`No bookings on ${formatDay("2026-10-21", true)}`)
    ).toBeInTheDocument();
    expect(getAgenda).toHaveBeenCalledWith("tok", ORG_ID, {
      fromDate: "2026-10-21",
      toDate: "2026-10-21",
      providerId: undefined,
    });
  });

  it("lists a day's bookings with status and deposit words and no actions", async () => {
    vi.mocked(getAgenda).mockResolvedValue(
      agenda([
        {
          day: "2026-10-21",
          bookings: [
            item(),
            item({
              id: "77777777-7777-4777-8777-777777777777",
              status: "pending_payment",
              customer_name: "Grace Hopper",
            }),
          ],
        },
      ])
    );
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    const first = screen.getByRole("link", { name: ADA });
    expect(first).toHaveAttribute(
      "href",
      `/studio/sea-salt/bookings/${BOOKING}`
    );
    expect(within(first).getByText("Confirmed")).toBeInTheDocument();
    expect(within(first).getByText("Deposit EC$25")).toBeInTheDocument();
    expect(first).toHaveTextContent("with Maya");
    const second = screen.getByRole("link", { name: GRACE });
    expect(within(second).getByText("Awaiting deposit")).toBeInTheDocument();
    expect(within(second).getByText("Deposit due")).toBeInTheDocument();
    // No actions on the list itself (the page header has its own Copy link button).
    expect(first.closest("ul")?.querySelector("button")).toBeNull();
  });

  it("shows the whole week, quiet days included, and the provider filter", async () => {
    vi.mocked(getAgenda).mockResolvedValue(
      agenda([{ day: "2026-10-21", bookings: [item()] }])
    );
    render(
      await AgendaPage({
        params,
        searchParams: search({
          view: "week",
          date: "2026-10-21",
          provider: PROVIDER_ID,
        }),
      })
    );
    expect(getAgenda).toHaveBeenCalledWith("tok", ORG_ID, {
      fromDate: "2026-10-19",
      toDate: "2026-10-25",
      providerId: PROVIDER_ID,
    });
    expect(screen.getAllByText("No bookings.")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Maya" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("link", { name: "All providers" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/agenda?view=week&date=2026-10-21"
    );
  });

  it("ignores a malformed date or provider in the URL", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "nonsense", provider: "x" }),
      })
    );
    const call = vi.mocked(getAgenda).mock.calls[0]?.[2];
    expect(call?.providerId).toBeUndefined();
    expect(call?.fromDate).toBe(call?.toDate);
    expect(call?.fromDate).not.toBe("nonsense");
  });

  it("sends an ended session to sign-in", async () => {
    vi.mocked(getAgenda).mockRejectedValue(apiError(401));
    await expect(
      AgendaPage({ params, searchParams: search() })
    ).rejects.toHaveProperty(
      "message",
      expect.stringContaining("NEXT_REDIRECT /signin?")
    );
  });

  it("shows an alert with a next step and reports when the agenda fails", async () => {
    vi.mocked(getAgenda).mockRejectedValue(apiError(500));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Try again in a moment."
    );
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "studio");
  });

  it("is a 404 for a business the person does not belong to", async () => {
    vi.mocked(findOrganisation).mockResolvedValue(null);
    await expect(
      AgendaPage({ params, searchParams: search() })
    ).rejects.toHaveProperty("message", "NEXT_NOT_FOUND");
  });

  it("always renders all seven days for an empty week, with the booking page link", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(
      await AgendaPage({
        params,
        searchParams: search({ view: "week", date: "2026-10-21" }),
      })
    );
    expect(screen.getByText("No bookings this week")).toBeInTheDocument();
    expect(screen.getAllByText("No bookings.")).toHaveLength(7);
    expect(
      screen.getByRole("link", { name: "Open your booking page" })
    ).toHaveAttribute("href", `/${PUBLIC_SLUG}`);
  });

  it("sends an empty day to the customers' page, not the marketing home", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    const link = screen.getByRole("link", { name: "Open your booking page" });
    expect(link).toHaveAttribute("href", `/${PUBLIC_SLUG}`);
    expect(
      screen.queryByRole("link", { name: "See how online booking works" })
    ).not.toBeInTheDocument();
  });

  it("sends an empty day to Settings until the booking page has an address", async () => {
    vi.mocked(getBusinessProfile).mockResolvedValue(
      profile("America/Grenada", null)
    );
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(
      screen.getByRole("link", { name: "Set up your booking page" })
    ).toHaveAttribute("href", "/studio/sea-salt/settings");
    expect(
      screen.queryByRole("heading", { name: "Your booking page" })
    ).not.toBeInTheDocument();
  });

  it("shows the customers' address and says the studio address is for staff", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(
      screen.getByRole("heading", { name: "Your booking page" })
    ).toBeInTheDocument();
    expect(screen.getByText(`/${PUBLIC_SLUG}`)).toBeInTheDocument();
    expect(screen.getByText("/studio/sea-salt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View my page" })).toHaveAttribute(
      "href",
      `/${PUBLIC_SLUG}`
    );
    expect(
      screen.getByRole("button", { name: "Copy link" })
    ).toBeInTheDocument();
  });

  it("keeps Day, Week and the date steps in one navigation row", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    const dates = screen.getByRole("navigation", { name: "Change date" });
    const views = screen.getByRole("navigation", { name: "Agenda view" });
    expect(dates.parentElement).toBe(views.parentElement);
    expect(
      within(dates).getByRole("link", { name: "Prev" })
    ).toBeInTheDocument();
    expect(
      within(views).getByRole("link", { name: "Week" })
    ).toBeInTheDocument();
  });

  it("says when a busy range is cut off and links to the next page", async () => {
    vi.mocked(getAgenda).mockResolvedValue({
      ...agenda([{ day: "2026-10-21", bookings: [item()] }]),
      limit: 1,
      total: 3,
    });
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    expect(screen.getByText("Showing 1 of 3 bookings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "More bookings" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/agenda?view=day&date=2026-10-21&offset=1"
    );
  });

  it("passes the offset to the API and offers the previous page", async () => {
    vi.mocked(getAgenda).mockResolvedValue({
      ...agenda([{ day: "2026-10-21", bookings: [item()] }]),
      limit: 1,
      offset: 1,
      total: 3,
    });
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21", offset: "1" }),
      })
    );
    expect(vi.mocked(getAgenda).mock.calls[0]?.[2].offset).toBe(1);
    expect(
      screen.getByRole("link", { name: "Previous bookings" })
    ).toBeInTheDocument();
  });

  it("offers only active providers as filters", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.getByRole("link", { name: "Kofi" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Retired Rae" })).toBeNull();
  });

  it("keeps a retired provider's name on old bookings", async () => {
    vi.mocked(getAgenda).mockResolvedValue(
      agenda([
        {
          day: "2026-10-21",
          bookings: [
            item({ provider_id: "88888888-8888-4888-8888-888888888888" }),
          ],
        },
      ])
    );
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    expect(screen.getByText(RETIRED)).toBeInTheDocument();
  });

  it("does not report a bad date range to Sentry", async () => {
    vi.mocked(getAgenda).mockRejectedValue(apiError(422));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose another day");
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe("returning client", () => {
  it("tags a returning client's booking on the agenda, in words", async () => {
    vi.mocked(getAgenda).mockResolvedValue(
      agenda([
        {
          day: "2026-10-21",
          bookings: [
            item({ returning_client: true, status: "pending" }),
            item({
              id: "77777777-7777-4777-8777-777777777777",
              customer_name: "Grace Hopper",
            }),
          ],
        },
      ])
    );
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    const flagged = screen.getByRole("link", { name: ADA });
    expect(within(flagged).getByText("Returning client")).toBeVisible();
    const plain = screen.getByRole("link", { name: GRACE });
    expect(within(plain).queryByText("Returning client")).toBeNull();
  });
});

describe("needs confirming", () => {
  const pendingItem = item({
    id: "99999999-9999-4999-8999-999999999999",
    customer_name: "Grace Hopper",
    status: "pending",
  });

  it("says nothing is waiting, keeping the heading, when there are none", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(
      screen.getByRole("heading", { name: "Needs confirming" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing waiting.")).toBeInTheDocument();
  });

  it("lists waiting bookings above everything else, with the count and a link to each", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    vi.mocked(loadPendingRequests).mockResolvedValue({
      ...agenda([{ day: "2026-10-21", bookings: [pendingItem] }]),
      total: 1,
    });
    render(await AgendaPage({ params, searchParams: search() }));
    const block = screen.getByRole("region", {
      name: "Needs confirming (1)",
    });
    const row = within(block).getByRole("link", { name: GRACE });
    expect(row).toHaveAttribute(
      "href",
      "/studio/sea-salt/bookings/99999999-9999-4999-8999-999999999999"
    );
    expect(row).toHaveTextContent("Deep tissue massage");
    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings.indexOf("Needs confirming (1)")).toBeLessThan(
      headings.indexOf("Your booking page")
    );
  });

  it("reads the waiting list on the business's own calendar", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    await AgendaPage({ params, searchParams: search() });
    expect(loadPendingRequests).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      "America/Grenada"
    );
  });

  it("keeps the agenda and explains when the waiting list cannot be read", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    vi.mocked(loadPendingRequests).mockRejectedValue(apiError(500));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(
      screen.getByRole("heading", { name: "Needs confirming" })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "studio");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Agenda"
    );
  });
});

describe("cancelled booking with an unpaid payment (#1849)", () => {
  it("keeps the neutral amount on a cancelled online payment, never due", async () => {
    vi.mocked(getAgenda).mockResolvedValue(
      agenda([
        {
          day: "2026-10-21",
          bookings: [
            item({
              status: "cancelled",
              payment_kind: "payment",
              deposit_minor: 2500,
            }),
          ],
        },
      ])
    );
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    const row = screen.getByRole("link", { name: ADA });
    expect(within(row).getByText("Cancelled")).toBeVisible();
    expect(within(row).getByText("Payment EC$25")).toBeVisible();
    expect(row).not.toHaveTextContent("Payment due");
    expect(row).not.toHaveTextContent("Deposit due");
    expect(row).not.toHaveTextContent("Payment cancelled");
  });

  it("keeps the neutral amount on a cancelled online deposit, never due", async () => {
    vi.mocked(getAgenda).mockResolvedValue(
      agenda([
        {
          day: "2026-10-21",
          bookings: [item({ status: "cancelled", deposit_minor: 2500 })],
        },
      ])
    );
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    const row = screen.getByRole("link", { name: ADA });
    expect(within(row).getByText("Deposit EC$25")).toBeVisible();
    expect(row).not.toHaveTextContent("Deposit due");
    expect(row).not.toHaveTextContent("Payment due");
  });

  it("does not show the returning-client tag once the booking is cancelled", async () => {
    vi.mocked(getAgenda).mockResolvedValue(
      agenda([
        {
          day: "2026-10-21",
          bookings: [item({ status: "cancelled", returning_client: true })],
        },
      ])
    );
    render(
      await AgendaPage({
        params,
        searchParams: search({ date: "2026-10-21" }),
      })
    );
    expect(screen.queryByText("Returning client")).toBeNull();
  });
});
