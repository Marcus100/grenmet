import type { BookingPublicBusinessPage } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INK, TYPE_FILL } from "@/lib/business-type-colours";
import { BusinessListing } from "./business-listing";

const NO_LISTING = /No businesses listed yet/u;
const NO_MATCH = /No businesses match that search/u;
const CANNOT_LOAD = /cannot be loaded/u;
const NO_PAGE = /No businesses on this page/u;
const TIDE_NAME = /^Tide Barbers/u;

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

const TILE_COLOUR = /background-color: rgb\((\d+), (\d+), (\d+)\)/u;

function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const red = Math.floor(n / 65_536);
  const green = Math.floor(n / 256) % 256;
  return `rgb(${red}, ${green}, ${n % 256})`;
}

function fillOf(element: HTMLElement | undefined): string | undefined {
  return element?.getAttribute("style")?.match(TILE_COLOUR)?.[0];
}

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
    expect(within(link).getByText("Book").getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("falls back to the business type word when there is no category", () => {
    render(
      <BusinessListing
        listing={page({
          items: [{ ...TIDE, category: null, business_type: "hair" }],
        })}
        query={NO_QUERY}
      />
    );

    expect(screen.getByText("Hair · Gouyave")).toBeTruthy();
  });

  it("puts the cards in one scroll-snap rail, one list item each", () => {
    render(
      <BusinessListing
        listing={page({
          items: [TIDE, { ...TIDE, slug: "b", name: "Bay Gym" }],
        })}
        query={NO_QUERY}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const rail = items[0]?.parentElement;
    expect(rail?.getAttribute("class")).toContain("snap-x");
    expect(rail?.getAttribute("class")).toContain("overflow-x-auto");
    expect(
      screen.getByRole("link", { name: TIDE_NAME }).getAttribute("class")
    ).toContain("press");
  });

  it("fills the card with the brand colour when it clears 4.5:1 for white text", () => {
    render(
      <BusinessListing
        listing={page({ items: [{ ...TIDE, brand_color: "#8a1a45" }] })}
        query={NO_QUERY}
      />
    );

    expect(fillOf(screen.getByRole("link", { name: TIDE_NAME }))).toBe(
      `background-color: ${rgb("#8a1a45")}`
    );
  });

  it("uses neutral ink for a missing, pale or unsafe brand colour", () => {
    for (const brand_color of [null, "#ffff00", "red; background:url(x)"]) {
      const { unmount } = render(
        <BusinessListing
          listing={page({ items: [{ ...TIDE, brand_color }] })}
          query={NO_QUERY}
        />
      );
      expect(fillOf(screen.getByRole("link", { name: TIDE_NAME }))).toBe(
        `background-color: ${rgb(INK)}`
      );
      unmount();
    }
  });

  it("shows a logo in a small circle, and no circle without one", () => {
    const { container, rerender } = render(
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
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");

    rerender(<BusinessListing listing={page()} query={NO_QUERY} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows no description panel text for a missing description and keeps the Book pill", () => {
    render(
      <BusinessListing
        listing={page({ items: [{ ...TIDE, short_description: null }] })}
        query={NO_QUERY}
      />
    );

    expect(screen.getByText("Book")).toBeTruthy();
  });

  it("shows no service tiles yet (the API sends none)", () => {
    const { container } = render(
      <BusinessListing listing={page()} query={NO_QUERY} />
    );
    expect(container.textContent).not.toContain("EC$");
  });

  it("says so when no business is listed yet", () => {
    render(
      <BusinessListing
        listing={page({ items: [], types_available: [] })}
        query={NO_QUERY}
      />
    );

    expect(screen.getByText(NO_LISTING)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("says the page is empty past the last one, and keeps the way back", () => {
    render(
      <BusinessListing
        listing={page({ items: [], page: 4 })}
        query={{ q: undefined, category: undefined, type: undefined, page: 4 }}
      />
    );

    expect(screen.getByText(NO_PAGE)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Previous page" }).getAttribute("href")
    ).toBe("/?page=3");
  });

  it("says no match when a search finds nothing", () => {
    render(
      <BusinessListing
        listing={page({ items: [] })}
        query={{ q: "zzz", category: undefined, type: undefined, page: 1 }}
      />
    );

    expect(screen.getByText(NO_MATCH)).toBeTruthy();
    expect(screen.queryByText(NO_LISTING)).toBeNull();
  });

  it("shows no category chips, but keeps the category in the search form and page links", () => {
    render(
      <BusinessListing
        listing={page({ has_more: true })}
        query={{ q: "fade", category: "Barbers", type: undefined, page: 1 }}
      />
    );

    expect(screen.queryByRole("navigation", { name: "Categories" })).toBeNull();
    expect(screen.queryByText("No categories yet.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Hair" })).toBeNull();
    const search = document.querySelector("search");
    expect(
      search?.querySelector('input[name="category"]')?.getAttribute("value")
    ).toBe("Barbers");
    expect(
      search?.querySelector<HTMLInputElement>('input[name="q"]')?.value
    ).toBe("fade");
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href")
    ).toBe("/?q=fade&category=Barbers&page=2");
  });

  it("has a search pill with the new placeholder and a real submit button", () => {
    render(<BusinessListing listing={page()} query={NO_QUERY} />);

    const box = screen.getByRole("searchbox", { name: "Search businesses" });
    expect(box.getAttribute("placeholder")).toBe(
      "What do you want to book today?"
    );
    const submit = screen.getByRole("button", { name: "Search" });
    expect(submit.getAttribute("type")).toBe("submit");
    expect(document.querySelector("search")?.getAttribute("class")).toContain(
      "sticky"
    );
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

  it("has exactly one h1, first, then h2 sections and h3 cards with no skipped level", () => {
    const { container } = render(
      <BusinessListing
        intro={<h1>Book any appointment</h1>}
        listing={page()}
        query={NO_QUERY}
      />
    );

    const headings = Array.from(container.querySelectorAll("h1, h2, h3")).map(
      (heading) => heading.tagName
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(headings).toEqual(["H1", "H2", "H3", "H2"]);
    expect(
      screen.getByRole("region", { name: "Businesses to book" })
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Types of business" })
    ).toBeTruthy();
  });

  describe("type tiles", () => {
    function tiles() {
      return screen.getByRole("navigation", { name: "Browse by type" });
    }

    it("shows All (ink), then one coloured tile per available type in the order given", () => {
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
      expect(links.map((link) => fillOf(link))).toEqual(
        [INK, TYPE_FILL.beauty, TYPE_FILL.hair, TYPE_FILL.home_services].map(
          (hex) => `background-color: ${rgb(hex)}`
        )
      );
      expect(links[0]?.getAttribute("aria-current")).toBe("page");
      expect(links[1]?.getAttribute("aria-current")).toBeNull();
      expect(tiles().querySelectorAll("svg[aria-hidden='true']")).toHaveLength(
        4
      );
      expect(tiles().getAttribute("class")).toContain("grid-cols-2");
      expect(tiles().getAttribute("class")).toContain("md:grid-cols-6");
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

    it("marks the chosen tile with aria-current and an inner ring, keeps q, drops category", () => {
      render(
        <BusinessListing
          listing={page()}
          query={{ q: "fade", category: "Barbers", type: "hair", page: 3 }}
        />
      );

      const links = within(tiles()).getAllByRole("link");
      const hair = links.find((link) => link.textContent === "Hair");
      expect(hair?.getAttribute("aria-current")).toBe("page");
      expect(hair?.getAttribute("class")).toContain("inset_0_0_0_3px");
      expect(hair?.getAttribute("href")).toBe("/?q=fade&type=hair");
      expect(links[0]?.getAttribute("aria-current")).toBeNull();
      expect(links[0]?.getAttribute("class")).not.toContain("inset_0_0_0_3px");
      expect(links[0]?.getAttribute("href")).toBe("/?q=fade");
    });

    it("gives laptops a compact row with a different name, the same types and the chosen state", () => {
      render(
        <BusinessListing
          listing={page()}
          query={{ q: undefined, category: undefined, type: "hair", page: 1 }}
        />
      );

      const row = screen.getByRole("navigation", { name: "Business types" });
      expect(row.getAttribute("class")).toContain("md:flex");
      expect(row.getAttribute("class")).toContain("hidden");
      expect(
        within(row)
          .getAllByRole("link")
          .map((link) => link.textContent)
      ).toEqual(["All", "Beauty", "Hair", "Home"]);
      expect(
        within(row)
          .getByRole("link", { name: "Hair" })
          .getAttribute("aria-current")
      ).toBe("page");
    });

    it("keeps the type in the search form and the page links", () => {
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

      const section = screen.getByRole("region", { name: "Types of business" });
      expect(within(section).getByText("No business types yet.")).toBeTruthy();
      expect(within(section).queryByRole("link")).toBeNull();
      expect(
        screen.queryByRole("navigation", { name: "Business types" })
      ).toBeNull();
    });

    it("treats a missing types_available as none", () => {
      render(
        <BusinessListing
          listing={page({ types_available: undefined })}
          query={NO_QUERY}
        />
      );

      expect(screen.getByText("No business types yet.")).toBeTruthy();
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
    it("fills the photo panel with a safe https cover, keeping the logo circle", () => {
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
        "https://cdn.example.test/logo.png",
        "https://cdn.example.test/cover.jpg",
      ]);
      const cover = images[1];
      expect(cover?.getAttribute("alt")).toBe("");
      expect(cover?.getAttribute("class")).toContain("object-cover");
      expect(cover?.getAttribute("referrerpolicy")).toBe("no-referrer");
      // The white description panel gives way to the photo.
      expect(screen.queryByText("Book")).toBeNull();
    });

    it("ignores a cover that is not a safe https address and shows the white panel", () => {
      for (const cover_url of [
        "http://cdn.example.test/c.jpg",
        "javascript:alert(1)",
        "data:image/png;base64,AAAA",
        "https://user:pw@cdn.example.test/c.jpg",
        "not a url",
        null,
      ]) {
        const { container, unmount } = render(
          <BusinessListing
            listing={page({ items: [{ ...TIDE, cover_url }] })}
            query={NO_QUERY}
          />
        );
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByText("Book")).toBeTruthy();
        unmount();
      }
    });
  });
});
