import { describe, expect, it } from "vitest";
import { buildSearchIndex, type SearchEntry, searchIndex } from "@/lib/search";

const index = buildSearchIndex([
  {
    title: "How sargassum reaches Bathway",
    summary: "Wind and currents explained",
    href: "/explore/news/sargassum",
    section: "Stories",
  },
]);
const hrefs = (query: string) => searchIndex(index, query).map((e) => e.href);

const entry = (over: Partial<SearchEntry>): SearchEntry => ({
  title: "",
  description: "",
  href: "",
  section: "Weather",
  kind: "page",
  ...over,
});

describe("searchIndex over the real menu", () => {
  it("finds a menu page by title", () => {
    expect(hrefs("radar")[0]).toBe("/weather/radar");
  });

  it("matches word prefixes and needs every word", () => {
    expect(hrefs("tid")).toContain("/marine/tides");
    expect(hrefs("tides aviation")).toEqual([]);
  });

  it("includes published articles", () => {
    expect(hrefs("sargassum bathway")).toEqual(["/explore/news/sargassum"]);
  });

  it("lists each page once even when it appears in two menu groups", () => {
    expect(index.filter((e) => e.href === "/alerts")).toHaveLength(1);
  });

  it("returns nothing for an empty query", () => {
    expect(searchIndex(index, "   ")).toEqual([]);
  });
});

describe("searchIndex ranking", () => {
  it("ranks title over description, and built over planned", () => {
    const fixed = [
      entry({ href: "/desc", title: "Other", description: "Heat safety" }),
      entry({ href: "/planned", title: "Heat index", planned: true }),
      entry({ href: "/title", title: "Heat index" }),
    ];
    expect(searchIndex(fixed, "heat").map((e) => e.href)).toEqual([
      "/title",
      "/planned",
      "/desc",
    ]);
  });
});
