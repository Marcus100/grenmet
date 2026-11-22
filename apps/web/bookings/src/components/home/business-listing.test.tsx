import type { BookingPublicBusinessPage } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessListing } from "./business-listing";

const NO_LISTING = /No businesses listed yet/u;
const NO_MATCH = /No businesses match that search/u;
const CANNOT_LOAD = /cannot be loaded/u;

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
  it("links each card to the business's own booking page", () => {
    render(<BusinessListing listing={page()} query={NO_QUERY} />);

    const card = screen.getByRole("article");
    expect(
      within(card).getByRole("heading", { name: "Tide Barbers" })
    ).toBeTruthy();
    expect(
      within(card)
        .getByRole("link", { name: "Tide Barbers" })
        .getAttribute("href")
    ).toBe("/tide-barbers");
    expect(within(card).getByText("Barbers")).toBeTruthy();
    expect(
      within(card).getByText("Fades and beards, walk-ins welcome")
    ).toBeTruthy();
    expect(within(card).getByText("Gouyave")).toBeTruthy();
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

    const search = screen.getByRole("search");
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
