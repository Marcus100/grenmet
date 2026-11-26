import type {
  BookingCustomerList,
  BookingCustomerListItem,
} from "@barrelsgd/api-client";
import { formatDay } from "@barrelsgd/bookings-web/lib/booking-format";
import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  getBusinessProfile: vi.fn(),
  listCustomers: vi.fn(),
}));
vi.mock("@/lib/studio-pending", () => ({
  loadBusinessProfile: (token: string, organisationId: string) =>
    getBusinessProfile(token, organisationId),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.9" }))
  ),
}));
vi.mock("@/env", () => ({
  env: { TRUSTED_WEB_SECRET: "s".repeat(32), VISITOR_IP_PROXY_HOPS: 1 },
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import { requireSession } from "@/lib/session";
import {
  findOrganisation,
  getBusinessProfile,
  listCustomers,
} from "@/lib/studio-api";
import CustomersPage from "./page";

const params = Promise.resolve({ orgSlug: "sea-salt" });
/** The person's own address travels with the call, for the API's rate limit. */
const visitor = {
  "X-Visitor-IP": "203.0.113.9",
  "X-Visitor-Secret": "s".repeat(32),
};
const search = (query: Record<string, string | string[]> = {}) =>
  Promise.resolve(query);
const HERE = "/studio/sea-salt/customers";
const EMPTY = "No customers yet. They appear here after their first booking.";

function customer(
  overrides: Partial<BookingCustomerListItem> = {}
): BookingCustomerListItem {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1 473 555 0100",
    bookings_count: 3,
    // 14:00 UTC is 10:00 in Grenada.
    last_visit_at: "2026-10-21T14:00:00Z",
    next_booking_at: "2026-12-01T14:00:00Z",
    returning: true,
    ...overrides,
  };
}

function page(
  customers: BookingCustomerListItem[],
  overrides: Partial<BookingCustomerList> = {}
): BookingCustomerList {
  return {
    total: customers.length,
    limit: 50,
    offset: 0,
    customers,
    ...overrides,
  };
}

async function show(query: Record<string, string | string[]> = {}) {
  render(await CustomersPage({ params, searchParams: search(query) }));
}

function hrefOf(name: string): URL {
  const link = screen.getByRole("link", { name });
  return new URL(link.getAttribute("href") ?? "", "http://localhost");
}

beforeEach(() => {
  cleanup();
  reportError.mockReset();
  vi.mocked(requireSession).mockClear();
  vi.mocked(listCustomers).mockReset();
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: "sea-salt",
    role: "member",
  });
  vi.mocked(getBusinessProfile).mockResolvedValue({
    currency: "XCD",
    publicSlug: "sea-salt-spa",
    timezone: "America/Grenada",
  });
});

describe("studio customers page", () => {
  it("shows each customer's contact details and booking facts", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customer()]));
    await show();

    expect(
      screen.getByRole("heading", { level: 1, name: "Customers" })
    ).toBeTruthy();
    const row = screen.getByRole("listitem");
    expect(
      within(row).getByRole("heading", { name: "Ada Lovelace" })
    ).toBeTruthy();
    expect(within(row).getByText("ada@example.com")).toBeTruthy();
    expect(within(row).getByText("Returning customer")).toBeTruthy();
    const call = within(row).getByRole("link", {
      name: "Call +1 473 555 0100",
    });
    expect(call.getAttribute("href")).toBe("tel:+14735550100");
    expect(
      within(row).getByText("Bookings").nextElementSibling?.textContent
    ).toBe("3");
    expect(
      within(row).getByText("Last visit").nextElementSibling?.textContent
    ).toBe(formatDay("2026-10-21", true));
    expect(
      within(row).getByText("Next booking").nextElementSibling?.textContent
    ).toBe(`${formatDay("2026-12-01", true)}, 10:00 am`);
    expect(screen.getByRole("status").textContent).toBe("1 customer");
    expect(listCustomers).toHaveBeenCalledWith("tok", ORG_ID, {
      offset: 0,
      search: undefined,
      visitor,
    });
  });

  it("says so when a customer has no visit, no booking and no contact details", async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page([
        customer({
          name: "",
          email: null,
          phone: null,
          bookings_count: 1,
          last_visit_at: null,
          next_booking_at: null,
          returning: false,
        }),
      ])
    );
    await show();

    const row = screen.getByRole("listitem");
    expect(
      within(row).getByRole("heading", { name: "No name given" })
    ).toBeTruthy();
    expect(within(row).getByText("No contact details")).toBeTruthy();
    expect(within(row).getByText("None yet")).toBeTruthy();
    expect(within(row).getByText("Nothing booked")).toBeTruthy();
    expect(within(row).queryByText("Returning customer")).toBeNull();
    expect(within(row).queryByRole("link")).toBeNull();
  });

  it("shows a phone with no digits as plain text, never a broken link", async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page([customer({ phone: "ask at the desk" })])
    );
    await show();
    expect(screen.getByText("ask at the desk").closest("a")).toBeNull();
  });

  it("tells a new business where customers come from", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    await show();
    expect(screen.getByText(EMPTY)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("link", { name: "Clear search" })).toBeNull();
  });

  it("searches with a GET form that keeps what was typed", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    await show({ q: "  grace " });

    expect(listCustomers).toHaveBeenCalledWith("tok", ORG_ID, {
      offset: 0,
      search: "grace",
      visitor,
    });
    const box = screen.getByRole("searchbox", {
      name: "Search by name, email or phone",
    });
    expect(box.getAttribute("name")).toBe("q");
    expect((box as HTMLInputElement).value).toBe("grace");
    const form = box.closest("form");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe(HERE);
    expect(screen.getByText('No customers match "grace".')).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(hrefOf("Clear search").pathname).toBe(HERE);
    expect(hrefOf("Clear search").search).toBe("");
  });

  it("cuts an over-long search to what the API accepts", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([]));
    await show({ q: "x".repeat(150) });
    expect(listCustomers).toHaveBeenCalledWith("tok", ORG_ID, {
      offset: 0,
      search: "x".repeat(100),
      visitor,
    });
  });

  it("links the next and previous pages and keeps the search", async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page([customer()], { total: 120, offset: 50 })
    );
    await show({ q: "ada", offset: "50" });

    expect(listCustomers).toHaveBeenCalledWith("tok", ORG_ID, {
      offset: 50,
      search: "ada",
      visitor,
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Showing 51 to 51 of 120 customers"
    );
    const next = hrefOf("More customers");
    expect(next.pathname).toBe(HERE);
    expect(next.searchParams.get("offset")).toBe("100");
    expect(next.searchParams.get("q")).toBe("ada");
    const previous = hrefOf("Previous customers");
    expect(previous.searchParams.has("offset")).toBe(false);
    expect(previous.searchParams.get("q")).toBe("ada");
  });

  it("offers no page links when everything fits", async () => {
    vi.mocked(listCustomers).mockResolvedValue(page([customer()]));
    await show({ offset: "not-a-number" });
    expect(listCustomers).toHaveBeenCalledWith("tok", ORG_ID, {
      offset: 0,
      search: undefined,
      visitor,
    });
    expect(screen.queryByRole("link", { name: "More customers" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Previous customers" })
    ).toBeNull();
  });

  it.each(["100001", "-5", "1.5", "1e9"])(
    "starts from the first page for an offset the API would refuse (%s)",
    async (value) => {
      vi.mocked(listCustomers).mockResolvedValue(page([customer()]));
      await show({ offset: value });
      expect(listCustomers).toHaveBeenCalledWith("tok", ORG_ID, {
        offset: 0,
        search: undefined,
        visitor,
      });
    }
  );

  it("accepts the largest offset the API takes", async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page([], { total: 3, offset: 100_000 })
    );
    await show({ offset: "100000" });
    expect(listCustomers).toHaveBeenCalledWith("tok", ORG_ID, {
      offset: 100_000,
      search: undefined,
      visitor,
    });
  });

  it("offers the way back from a page past the end", async () => {
    vi.mocked(listCustomers).mockResolvedValue(
      page([], { total: 3, offset: 50 })
    );
    await show({ offset: "50" });
    expect(screen.getByText("No more customers.")).toBeTruthy();
    expect(hrefOf("Previous customers").searchParams.has("offset")).toBe(false);
  });

  it("explains a failed read and reports it without the search", async () => {
    vi.mocked(listCustomers).mockRejectedValue(apiError(500));
    await show({ q: "ada" });

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByText("The customers list is not available right now.")
    ).toBeTruthy();
    expect(
      within(alert).getByRole("link", { name: "Reload the customers list" })
    ).toBeTruthy();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(reportError.mock.calls)).not.toContain("ada");
    // The search box stays so the person can try again.
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("sends an ended session to sign-in without the search in the address", async () => {
    vi.mocked(listCustomers).mockRejectedValue(apiError(401));
    await expect(
      CustomersPage({ params, searchParams: search({ q: "ada" }) })
    ).rejects.toThrow(
      `NEXT_REDIRECT /signin?${new URLSearchParams({ returnTo: HERE })}`
    );
    expect(requireSession).toHaveBeenCalledWith(HERE);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("is a 404 for a business the person does not belong to", async () => {
    vi.mocked(findOrganisation).mockResolvedValue(null);
    await expect(
      CustomersPage({ params, searchParams: search() })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listCustomers).not.toHaveBeenCalled();
  });
});
