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

  it("marks Home as the current page in both navigation bars", async () => {
    vi.mocked(getPublicBusinesses).mockResolvedValue(EMPTY);
    await renderHome();

    for (const name of ["Main", "Quick links"]) {
      const nav = screen.getByRole("navigation", { name });
      const home = within(nav).getByRole("link", { name: "Home" });
      expect(home.getAttribute("href")).toBe("/");
      expect(home.getAttribute("aria-current")).toBe("page");
    }
    const quick = within(
      screen.getByRole("navigation", { name: "Quick links" })
    );
    expect(
      quick.getByRole("link", { name: "Studio" }).getAttribute("href")
    ).toBe("/studio");
    expect(
      document.querySelectorAll(
        'nav[aria-label="Quick links"] svg[aria-hidden="true"]'
      )
    ).toHaveLength(3);
    expect(
      within(screen.getByRole("navigation", { name: "Quick links" }))
        .getByRole("link", { name: "Search" })
        .getAttribute("href")
    ).toBe("/#home-search");
  });
});
