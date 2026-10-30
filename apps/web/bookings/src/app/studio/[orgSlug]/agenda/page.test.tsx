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
  getBusinessTimezone: vi.fn(),
  listProviders: vi.fn(),
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
  getBusinessTimezone,
  listProviders,
} from "@/lib/studio-api";
import AgendaPage from "./page";

const params = Promise.resolve({ orgSlug: "sea-salt" });
const search = (query: Record<string, string> = {}) => Promise.resolve(query);
const ADA = /Ada Lovelace/u;
const GRACE = /Grace Hopper/u;
const RETIRED = /with Retired Rae/u;
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
  vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
  vi.mocked(listProviders).mockResolvedValue([
    provider(PROVIDER_ID, "Maya"),
    provider("66666666-6666-4666-8666-666666666666", "Kofi"),
    provider("88888888-8888-4888-8888-888888888888", "Retired Rae", false),
  ]);
});

describe("studio agenda", () => {
  it("defaults to today on the business's calendar, not the server's", async () => {
    // 02:30 UTC on 22 Oct is still the evening of 21 Oct in Grenada, but
    // already the 22nd in Auckland: the profile's zone must decide.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T02:30:00Z"));
    try {
      vi.mocked(getAgenda).mockResolvedValue(agenda([]));
      vi.mocked(getBusinessTimezone).mockResolvedValue("Pacific/Auckland");
      render(await AgendaPage({ params, searchParams: search() }));
      expect(getAgenda).toHaveBeenLastCalledWith(
        "tok",
        ORG_ID,
        expect.objectContaining({ fromDate: "2026-10-22" })
      );
      cleanup();
      vi.mocked(getBusinessTimezone).mockResolvedValue("America/Grenada");
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

  it("offers New booking to admins only", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(
      screen.queryByRole("link", { name: "New booking" })
    ).not.toBeInTheDocument();
    cleanup();
    vi.mocked(findOrganisation).mockResolvedValue({
      id: ORG_ID,
      name: "Sea Salt Spa",
      slug: "sea-salt",
      role: "admin",
    });
    render(await AgendaPage({ params, searchParams: search() }));
    expect(screen.getByRole("link", { name: "New booking" })).toHaveAttribute(
      "href",
      "/studio/sea-salt/bookings/new"
    );
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
    expect(within(first).getByText("Deposit $25")).toBeInTheDocument();
    expect(first).toHaveTextContent("with Maya");
    const second = screen.getByRole("link", { name: GRACE });
    expect(within(second).getByText("Awaiting deposit")).toBeInTheDocument();
    expect(within(second).getByText("Deposit due")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
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

  it("always renders all seven days for an empty week, with the set-up link", async () => {
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
      screen.getByRole("link", { name: "See how online booking works" })
    ).toHaveAttribute("href", "/");
  });

  it("links to how online booking works from an empty day", async () => {
    vi.mocked(getAgenda).mockResolvedValue(agenda([]));
    render(await AgendaPage({ params, searchParams: search() }));
    expect(
      screen.getByRole("link", { name: "See how online booking works" })
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
