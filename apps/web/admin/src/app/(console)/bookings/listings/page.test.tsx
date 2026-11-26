import { AuthApiError } from "@barrelsgd/auth";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listListingReviews: vi.fn() }));
const gate = vi.hoisted(() => ({ requireGate: vi.fn() }));
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/bookings-listing-api", () => api);
vi.mock("@/lib/staff-gate", () => gate);
vi.mock("@/app/(console)/bookings/listings/actions", () => ({
  approveListingAction: vi.fn(),
  withdrawListingAction: vi.fn(),
}));
const PUBLIC_PAGE_LINK = /Public booking page/u;
const APPROVED_STAMP = /Approved 2026-11-20 09:30 UTC/u;

vi.mock("next/navigation", () => ({
  redirect: nav.redirect,
  unstable_rethrow: () => undefined,
}));

const { default: ListingsPage } = await import("./page");

const waiting = {
  organisation_id: "org_waiting",
  public_slug: "babydoll-beauty-bar",
  display_name: "Babydoll Beauty Bar",
  listed: true,
  listing_approved_at: null,
  listing_approved_by_user_id: null,
  self_created: false,
  owner_left_at: null,
  sender_name_flagged_at: null,
};

const approved = {
  organisation_id: "org_approved",
  public_slug: "corner-shop",
  display_name: "Corner Shop",
  listed: true,
  listing_approved_at: "2026-11-20T09:30:00Z",
  listing_approved_by_user_id: "0b8f6f0e-6a53-4a0e-9a9b-3f1f2c5d7e11",
  self_created: true,
  owner_left_at: "2026-11-21T10:00:00Z",
  sender_name_flagged_at: null,
};

function page(queue?: string, notice?: string, pageParam?: string) {
  return ListingsPage({
    searchParams: Promise.resolve({ queue, notice, page: pageParam }),
  });
}

describe("bookings listing review page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.requireGate.mockResolvedValue({
      status: "staff",
      accessToken: "tok",
      email: "me@barrels.gd",
    });
  });

  it("defaults to the waiting queue and says so when it is empty", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      size: 25,
    });
    render(await page());
    expect(api.listListingReviews).toHaveBeenCalledWith("tok", "pending", 1);
    expect(screen.getByText("No listings waiting")).toBeTruthy();
  });

  it.each([
    ["approved", "No listings approved yet"],
    ["flagged", "Nothing is flagged"],
    ["all", "No businesses yet"],
  ])(
    "queries the %s queue and renders its empty state",
    async (queue, title) => {
      api.listListingReviews.mockResolvedValue({
        data: [],
        count: 0,
        page: 1,
        size: 25,
      });
      render(await page(queue));
      expect(api.listListingReviews).toHaveBeenCalledWith("tok", queue, 1);
      expect(screen.getByText(title)).toBeTruthy();
    }
  );

  it("falls back to the waiting queue for an unknown queue value", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      size: 25,
    });
    render(await page("nonsense"));
    expect(api.listListingReviews).toHaveBeenCalledWith("tok", "pending", 1);
  });

  it("shows each queue tab with the current one marked", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      size: 25,
    });
    render(await page("flagged"));
    const tabs = screen.getByRole("navigation", { name: "Listing queue" });
    expect(within(tabs).getAllByRole("link")).toHaveLength(4);
    expect(
      within(tabs).getByRole("link", { current: "page" }).textContent
    ).toBe("Flagged");
  });

  it("renders the name, slug, public link, written state and flags", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [waiting, approved],
      count: 2,
      page: 1,
      size: 25,
    });
    render(await page("all"));
    expect(screen.getByText("Babydoll Beauty Bar")).toBeTruthy();
    expect(screen.getByText("babydoll-beauty-bar")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: PUBLIC_PAGE_LINK });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://bookings.barrels.gd/babydoll-beauty-bar",
      "https://bookings.barrels.gd/corner-shop",
    ]);
    const businesses = screen.getByRole("list", { name: "Businesses" });
    expect(within(businesses).getByText("Waiting")).toBeTruthy();
    expect(within(businesses).getByText("Approved")).toBeTruthy();
    expect(screen.getByText(APPROVED_STAMP)).toBeTruthy();
    expect(screen.getByText("Self-created")).toBeTruthy();
    expect(screen.getByText("Owner left")).toBeTruthy();
  });

  it("offers approve for a waiting business and withdraw for an approved one", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [waiting, approved],
      count: 2,
      page: 1,
      size: 25,
    });
    render(await page("all"));
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy();
  });

  it("shows a plain refusal instead of a crash when the API says 403", async () => {
    api.listListingReviews.mockRejectedValue(
      new AuthApiError(403, "Forbidden")
    );
    render(await page());
    expect(screen.getByText("You don't have access")).toBeTruthy();
  });

  it("shows the written result of an action from the notice code", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [],
      count: 0,
      page: 1,
      size: 25,
    });
    render(await page("pending", "already-approved"));
    expect(screen.getByRole("alert").textContent).toContain("already approved");
  });

  it("encodes the public slug in the public booking link", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [{ ...waiting, public_slug: "shop one/2" }],
      count: 1,
      page: 1,
      size: 25,
    });
    render(await page("all"));
    const link = screen.getByRole("link", { name: PUBLIC_PAGE_LINK });
    expect(link.getAttribute("href")).toBe(
      "https://bookings.barrels.gd/shop%20one%2F2"
    );
  });

  it("queries the requested page", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [waiting],
      count: 60,
      page: 3,
      size: 25,
    });
    render(await page("pending", undefined, "3"));
    expect(api.listListingReviews).toHaveBeenCalledWith("tok", "pending", 3);
  });

  it("keeps the notice when an out-of-range page goes to the last page", async () => {
    api.listListingReviews.mockResolvedValue({
      data: [],
      count: 30,
      page: 5,
      size: 25,
    });
    await expect(page("pending", "approved", "5")).rejects.toThrow(
      "REDIRECT:/bookings/listings?queue=pending&page=2&notice=approved"
    );
  });
});
