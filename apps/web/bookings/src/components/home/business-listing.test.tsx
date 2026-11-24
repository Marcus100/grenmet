import type { BookingPublicBusinessPage } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessListing } from "./business-listing";

const NO_LISTING = /No businesses listed yet/u;
const NO_MATCH = /No businesses match that search/u;
const CANNOT_LOAD = /cannot be loaded/u;
const NO_PAGE = /No businesses on this page/u;
const TIDE_NAME = /^Tide Barbers/u;
const NO_CATEGORIES = /No categories yet/u;

const TIDE = {
  slug: "tide-barbers",
  name: "Tide Barbers",
  category: "Barbers",
  short_description: "Fades and beards, walk-ins welcome",
  city: "Gouyave",
  brand_color: null,
  logo_url: null,
};

function page(
  overrides: Partial<BookingPublicBusinessPage> = {}
): BookingPublicBusinessPage {
  return {
    items: [TIDE],
    page: 1,
    has_more: false,
    categories: ["Barbers", "Hair"],
    ...overrides,
  };
}

const NO_QUERY = { q: undefined, category: undefined, page: 1 };

describe("BusinessListing", () => {
  it("makes the whole card one link to the business's own booking page", () => {
    render(<BusinessListing listing={page()} query={NO_QUERY} />);

    const link = screen.getByRole("link", { name: TIDE_NAME });
    expect(link.getAttribute("href")).toBe("/tide-barbers");
    expect(
      within(link).getByRole("heading", { name: "Tide Barbers" })
    ).toBeTruthy();
    expect(within(link).getByText("Barbers · Gouyave")).toBeTruthy();
    expect(
      within(link).getByText("Fades and beards, walk-ins welcome")
    ).toBeTruthy();
    // "Book" is decoration inside the link, not a second control.
    expect(screen.queryByRole("button", { name: "Book" })).toBeNull();
    expect(link.querySelector("a, button")).toBeNull();
  });

  it("shows the first letter when a business has no logo, and a tint of its colour", () => {
    render(
      <BusinessListing
        listing={page({ items: [{ ...TIDE, brand_color: "#8a1a45" }] })}
        query={NO_QUERY}
      />
    );

    const tile = screen.getByText("T");
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(tile.getAttribute("style")).toContain("color-mix");
  });

  it("shows the logo instead of the letter when there is one", () => {
    const { container } = render(
      <BusinessListing
        listing={page({
          items: [{ ...TIDE, logo_url: "https://cdn.example.test/logo.png" }],
        })}
        query={NO_QUERY}
      />
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.test/logo.png"
    );
    expect(screen.queryByText("T")).toBeNull();
  });

  it("leaves out the missing parts of category and town, and the description on small cards", () => {
    render(
      <BusinessListing
        listing={page({
          items: [
            TIDE,
            {
              ...TIDE,
              slug: "b",
              name: "Bay Gym",
              category: null,
              city: "St George's",
            },
          ],
        })}
        query={NO_QUERY}
      />
    );

    expect(screen.getByText("St George's")).toBeTruthy();
    expect(
      screen.getAllByText("Fades and beards, walk-ins welcome")
    ).toHaveLength(1);
  });

  it("says so when no business is listed yet", () => {
    render(
      <BusinessListing
        listing={page({ items: [], categories: [] })}
        query={NO_QUERY}
      />
    );

    expect(screen.getByText(NO_LISTING)).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("says the page is empty past the last one, and keeps the way back", () => {
    render(
      <BusinessListing
        listing={page({ items: [], page: 4, categories: [] })}
        query={{ q: undefined, category: undefined, page: 4 }}
      />
    );

    expect(screen.getByText(NO_PAGE)).toBeTruthy();
    expect(screen.queryByText(NO_LISTING)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Previous page" }).getAttribute("href")
    ).toBe("/?page=3");
  });

  it("keeps the categories section and says none exist yet", () => {
    render(
      <BusinessListing
        listing={page({ items: [], categories: [] })}
        query={NO_QUERY}
      />
    );

    const categories = screen.getByRole("navigation", { name: "Categories" });
    expect(within(categories).getByText(NO_CATEGORIES)).toBeTruthy();
  });

  it("says no match when a search finds nothing", () => {
    render(
      <BusinessListing
        listing={page({ items: [], categories: [] })}
        query={{ q: "zzz", category: undefined, page: 1 }}
      />
    );

    expect(screen.getByText(NO_MATCH)).toBeTruthy();
    expect(screen.queryByText(NO_LISTING)).toBeNull();
  });

  it("offers each category as a chip and marks the chosen one", () => {
    render(
      <BusinessListing
        listing={page()}
        query={{ q: undefined, category: "barbers", page: 1 }}
      />
    );

    const categories = screen.getByRole("navigation", { name: "Categories" });
    expect(
      within(categories).getByRole("link", { name: "All" }).getAttribute("href")
    ).toBe("/");
    const hair = within(categories).getByRole("link", { name: "Hair" });
    expect(hair.getAttribute("href")).toBe("/?category=Hair");
    expect(hair.getAttribute("aria-current")).toBeNull();
    const barbers = within(categories).getByRole("link", { name: "Barbers" });
    expect(barbers.getAttribute("aria-current")).toBe("page");
  });

  it("keeps the search box and the chosen category when searching", () => {
    render(
      <BusinessListing
        listing={page()}
        query={{ q: "fade", category: "Barbers", page: 1 }}
      />
    );

    // jsdom does not map the <search> element to the "search" role, so find it by tag.
    const search = document.querySelector("search");
    expect(search).not.toBeNull();
    if (!search) {
      return;
    }
    expect(
      (within(search).getByRole("searchbox") as HTMLInputElement).value
    ).toBe("fade");
    const hidden = search.querySelector('input[name="category"]');
    expect(hidden?.getAttribute("value")).toBe("Barbers");
  });

  it("pages forward and back, keeping the search", () => {
    const { rerender } = render(
      <BusinessListing
        listing={page({ has_more: true })}
        query={{ q: "fade", category: undefined, page: 1 }}
      />
    );
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href")
    ).toBe("/?q=fade&page=2");
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();

    rerender(
      <BusinessListing
        listing={page({ page: 2, has_more: false })}
        query={{ q: "fade", category: undefined, page: 2 }}
      />
    );
    expect(
      screen.getByRole("link", { name: "Previous page" }).getAttribute("href")
    ).toBe("/?q=fade");
    expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
  });

  it("says the list cannot load right now, instead of showing nothing", () => {
    render(<BusinessListing listing={null} query={NO_QUERY} />);

    expect(screen.getByRole("alert").textContent).toMatch(CANNOT_LOAD);
  });
});
