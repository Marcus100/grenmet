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
const HIDDEN = /(^|\s)hidden(\s|$)/u;

const TIDE = {
  slug: "tide-barbers",
  name: "Tide Barbers",
  category: "Barbers",
  short_description: "Fades and beards, walk-ins welcome",
  city: "Gouyave",
  brand_color: null,
  logo_url: null,
  cover_url: null,
  business_type: null,
};

function page(
  overrides: Partial<BookingPublicBusinessPage> = {}
): BookingPublicBusinessPage {
  return {
    items: [TIDE],
    page: 1,
    has_more: false,
    categories: ["Barbers", "Hair"],
    types_available: ["beauty", "hair", "home_services"],
    ...overrides,
  };
}

const NO_QUERY = {
  q: undefined,
  category: undefined,
  type: undefined,
  page: 1,
};

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
        query={{ q: undefined, category: undefined, type: undefined, page: 4 }}
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
        query={{ q: "zzz", category: undefined, type: undefined, page: 1 }}
      />
    );

    expect(screen.getByText(NO_MATCH)).toBeTruthy();
    expect(screen.queryByText(NO_LISTING)).toBeNull();
  });

  it("offers each category as a chip and marks the chosen one", () => {
    render(
      <BusinessListing
        listing={page()}
        query={{ q: undefined, category: "barbers", type: undefined, page: 1 }}
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
        query={{ q: "fade", category: "Barbers", type: undefined, page: 1 }}
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
        query={{ q: "fade", category: undefined, type: undefined, page: 1 }}
      />
    );
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href")
    ).toBe("/?q=fade&page=2");
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();

    rerender(
      <BusinessListing
        listing={page({ page: 2, has_more: false })}
        query={{ q: "fade", category: undefined, type: undefined, page: 2 }}
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

  it("draws no style for a brand colour that is not a safe hex", () => {
    render(
      <BusinessListing
        listing={page({
          items: [{ ...TIDE, brand_color: "red; background:url(x)" }],
        })}
        query={NO_QUERY}
      />
    );

    expect(screen.getByText("T").hasAttribute("style")).toBe(false);
  });

  it("makes the first business the large card in one flat list", () => {
    render(
      <BusinessListing
        listing={page({
          items: [
            TIDE,
            { ...TIDE, slug: "b", name: "Bay Gym" },
            { ...TIDE, slug: "c", name: "Cove Clinic" },
          ],
        })}
        query={NO_QUERY}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("Fades and beards");
    // Every card has the decorative pill; on phones only the first shows it.
    const pills = items.map((item) =>
      within(item).getByText("Book").getAttribute("class")
    );
    expect(pills[0]).not.toMatch(HIDDEN);
    expect(pills[1]).toMatch(HIDDEN);
    expect(pills[2]).toMatch(HIDDEN);
    expect(
      items.every(
        (item) =>
          within(item).getByText("Book").getAttribute("aria-hidden") === "true"
      )
    ).toBe(true);
  });

  it("keeps the chosen category in a hidden field of the search form", () => {
    render(
      <BusinessListing
        listing={page()}
        query={{ q: undefined, category: "Hair", type: undefined, page: 1 }}
      />
    );

    expect(
      document
        .querySelector('search input[name="category"]')
        ?.getAttribute("value")
    ).toBe("Hair");
  });

  it("has exactly one h1, ahead of the businesses and the other headings", () => {
    const { container } = render(
      <BusinessListing
        intro={<h1>Book any appointment</h1>}
        listing={page()}
        query={NO_QUERY}
      />
    );

    const headings = Array.from(container.querySelectorAll("h1, h2, h3"));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(headings[0]?.tagName).toBe("H1");
    expect(screen.getByRole("region", { name: "Businesses" })).toBeTruthy();
  });

  describe("type tiles", () => {
    function tiles() {
      return screen.getByRole("navigation", { name: "Business types" });
    }

    it("shows All, then one tile per available type in the order given", () => {
      render(<BusinessListing listing={page()} query={NO_QUERY} />);

      const links = within(tiles()).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        "All",
        "Beauty",
        "Hair",
        "Home",
      ]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/",
        "/?type=beauty",
        "/?type=hair",
        "/?type=home_services",
      ]);
      expect(links[0]?.getAttribute("aria-current")).toBe("page");
      expect(links[1]?.getAttribute("aria-current")).toBeNull();
      expect(tiles().querySelectorAll("svg[aria-hidden='true']")).toHaveLength(
        4
      );
    });

    it("never shows a type the API did not list", () => {
      render(
        <BusinessListing
          listing={page({ types_available: ["tours"] })}
          query={NO_QUERY}
        />
      );

      expect(within(tiles()).getByRole("link", { name: "Tours" })).toBeTruthy();
      expect(
        within(tiles()).queryByRole("link", { name: "Beauty" })
      ).toBeNull();
    });

    it("marks the chosen tile and keeps the search words but not the category", () => {
      render(
        <BusinessListing
          listing={page()}
          query={{ q: "fade", category: "Barbers", type: "hair", page: 3 }}
        />
      );

      const links = within(tiles()).getAllByRole("link");
      const hair = links.find((link) => link.textContent === "Hair");
      expect(hair?.getAttribute("aria-current")).toBe("page");
      expect(hair?.getAttribute("href")).toBe("/?q=fade&type=hair");
      expect(links[0]?.getAttribute("aria-current")).toBeNull();
      expect(links[0]?.getAttribute("href")).toBe("/?q=fade");
    });

    it("keeps the type in the search form, the chips and the page links", () => {
      render(
        <BusinessListing
          listing={page({ has_more: true })}
          query={{ q: undefined, category: "Hair", type: "hair", page: 1 }}
        />
      );

      expect(
        document
          .querySelector('search input[name="type"]')
          ?.getAttribute("value")
      ).toBe("hair");
      const chips = screen.getByRole("navigation", { name: "Categories" });
      expect(
        within(chips)
          .getByRole("link", { name: "Barbers" })
          .getAttribute("href")
      ).toBe("/?category=Barbers&type=hair");
      expect(
        within(chips).getByRole("link", { name: "All" }).getAttribute("href")
      ).toBe("/?type=hair");
      expect(
        screen.getByRole("link", { name: "Next page" }).getAttribute("href")
      ).toBe("/?category=Hair&type=hair&page=2");
    });

    it("says there are no types yet, instead of hiding the section", () => {
      render(
        <BusinessListing
          listing={page({ types_available: [] })}
          query={NO_QUERY}
        />
      );

      expect(within(tiles()).getByText("No business types yet.")).toBeTruthy();
      expect(within(tiles()).queryByRole("link")).toBeNull();
    });

    it("treats a missing types_available as none", () => {
      render(
        <BusinessListing
          listing={page({ types_available: undefined })}
          query={NO_QUERY}
        />
      );

      expect(within(tiles()).getByText("No business types yet.")).toBeTruthy();
    });

    it("uses the no-match message when a type is chosen and nothing is listed", () => {
      render(
        <BusinessListing
          listing={page({ items: [] })}
          query={{ q: undefined, category: undefined, type: "tours", page: 1 }}
        />
      );

      expect(screen.getByText(NO_MATCH)).toBeTruthy();
    });
  });

  describe("cover photos", () => {
    it("fills the tile with a safe https cover and puts the logo over it", () => {
      const { container } = render(
        <BusinessListing
          listing={page({
            items: [
              {
                ...TIDE,
                cover_url: "https://cdn.example.test/cover.jpg",
                logo_url: "https://cdn.example.test/logo.png",
              },
            ],
          })}
          query={NO_QUERY}
        />
      );

      const images = Array.from(container.querySelectorAll("img"));
      expect(images.map((image) => image.getAttribute("src"))).toEqual([
        "https://cdn.example.test/cover.jpg",
        "https://cdn.example.test/logo.png",
      ]);
      expect(images[0]?.getAttribute("alt")).toBe("");
      expect(images[0]?.getAttribute("class")).toContain("object-cover");
      expect(images[0]?.getAttribute("referrerpolicy")).toBe("no-referrer");
      expect(screen.queryByText("T")).toBeNull();
    });

    it("shows the cover alone when there is no logo", () => {
      const { container } = render(
        <BusinessListing
          listing={page({
            items: [{ ...TIDE, cover_url: "https://cdn.example.test/c.webp" }],
          })}
          query={NO_QUERY}
        />
      );

      expect(container.querySelectorAll("img")).toHaveLength(1);
      expect(screen.queryByText("T")).toBeNull();
    });

    it("ignores a cover that is not https and keeps the brand tile", () => {
      for (const cover_url of [
        "http://cdn.example.test/c.jpg",
        "javascript:alert(1)",
        "data:image/png;base64,AAAA",
        "not a url",
        null,
      ]) {
        const { container, unmount } = render(
          <BusinessListing
            listing={page({
              items: [{ ...TIDE, brand_color: "#8a1a45", cover_url }],
            })}
            query={NO_QUERY}
          />
        );
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByText("T").getAttribute("style")).toContain(
          "color-mix"
        );
        unmount();
      }
    });
  });
});
