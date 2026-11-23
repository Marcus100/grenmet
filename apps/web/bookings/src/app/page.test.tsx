import type { BookingPublicBusinessPage } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicBusinesses } from "@/lib/public-businesses";
import HomePage from "./page";

const NO_LISTING = /No businesses listed yet/u;
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
      screen.getByRole("link", { name: "For businesses" }).getAttribute("href")
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
      screen.getByRole("link", { name: "Tide Barbers" }).getAttribute("href")
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
        name: "Online appointments for Grenada businesses",
      })
    ).toBeTruthy();
  });
});
