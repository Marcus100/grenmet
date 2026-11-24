import type { BookingPublicBusinessPage } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicBusinesses } from "@/lib/public-businesses";
import HomePage from "./page";

const NO_LISTING = /No businesses listed yet/u;
const TIDE_NAME = /^Tide Barbers/u;
const CANNOT_LOAD = /cannot be loaded/u;

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://bookings.example.test" },
}));
vi.mock("@/lib/public-businesses", () => ({ getPublicBusinesses: vi.fn() }));

const EMPTY: BookingPublicBusinessPage = {
  items: [],
  page: 1,
  has_more: false,
  categories: [],
  types_available: [],
};

async function renderHome(params: Record<string, string> = {}) {
  return render(await HomePage({ searchParams: Promise.resolve(params) }));
}

describe("bookings home page", () => {
  beforeEach(() => {
    vi.mocked(getPublicBusinesses).mockReset();
  });

  it("says no business is listed yet, and keeps the business link", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue(EMPTY);
    await renderHome();

    expect(screen.getByText(NO_LISTING)).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "For businesses" })
        .every((link) => link.getAttribute("href") === "/studio")
    ).toBe(true);
    expect(
      screen.getByRole("link", { name: "Open the studio" }).getAttribute("href")
    ).toBe("/studio");
  });

  it("lists the businesses that opted in", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue({
      ...EMPTY,
      items: [
        {
          slug: "tide-barbers",
          name: "Tide Barbers",
          category: "Barbers",
          short_description: null,
          city: "Gouyave",
          brand_color: null,
          logo_url: null,
          cover_url: null,
          business_type: null,
        },
      ],
      categories: ["Barbers"],
    });
    await renderHome();

    expect(
      screen.getByRole("link", { name: TIDE_NAME }).getAttribute("href")
    ).toBe("/tide-barbers");
    expect(screen.queryByText(NO_LISTING)).toBeNull();
  });

  it("passes the search and the category from the address to the list", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue(EMPTY);
    await renderHome({ q: " fade ", category: "Barbers", page: "3" });

    expect(getPublicBusinesses).toHaveBeenCalledWith({
      q: "fade",
      category: "Barbers",
      type: undefined,
      page: 3,
    });
  });

  it("still renders when the list cannot be loaded", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue(null);
    await renderHome();

    expect(screen.getByRole("alert").textContent).toMatch(CANNOT_LOAD);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Book any appointment in Grenada",
      })
    ).toBeTruthy();
  });

  it("marks Home as the current page in the rail and the bottom bar, icons named by label", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue(EMPTY);
    await renderHome();

    const rail = screen.getByRole("navigation", { name: "Main" });
    const bottom = screen.getByRole("navigation", { name: "Quick links" });
    expect(rail.getAttribute("class")).toContain("hidden");
    expect(rail.getAttribute("class")).toContain("md:flex");
    expect(bottom.getAttribute("class")).toContain("md:hidden");
    for (const nav of [rail, bottom]) {
      const home = within(nav).getByRole("link", { name: "Home" });
      expect(home.getAttribute("href")).toBe("/");
      expect(home.getAttribute("aria-current")).toBe("page");
      expect(
        within(nav)
          .getByRole("link", { name: "Types of business" })
          .getAttribute("href")
      ).toBe("/#types");
      expect(
        within(nav)
          .getByRole("link", { name: "For businesses" })
          .getAttribute("href")
      ).toBe("/studio");
    }
    expect(bottom.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
    expect(
      within(bottom).getByRole("link", { name: "Sign in" }).getAttribute("href")
    ).toBe("/signin?returnTo=%2F");
  });

  it("has one h1, the hero's Find a business link and the line under the hero", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue(EMPTY);
    const { container } = await renderHome();

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(
      container
        .querySelector("h1")
        ?.compareDocumentPosition(container.querySelector("h2") as Node)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen.getByRole("link", { name: "Find a business" }).getAttribute("href")
    ).toBe("#businesses");
    expect(
      screen.getByText(
        "Pick a business below, or open the booking page the business sent you."
      )
    ).toBeTruthy();
  });
});
