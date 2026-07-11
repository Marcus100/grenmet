import { describe, expect, it } from "vitest";
import {
  findPage,
  formatDate,
  newsByDate,
  type PageDoc,
  pagesInSection,
} from "@/lib/content-utils";

const make = (overrides: Partial<PageDoc>): PageDoc => ({
  title: "A page",
  dek: "About a page",
  section: "travel",
  slug: "a-page",
  draft: false,
  ...overrides,
});

describe("pagesInSection", () => {
  it("filters by section, drops drafts, sorts by title", () => {
    const pages = [
      make({ title: "Zebra", slug: "z" }),
      make({ title: "Apple", slug: "a" }),
      make({ title: "Draft", slug: "d", draft: true }),
      make({ title: "Other", slug: "o", section: "business" }),
    ];
    expect(pagesInSection(pages, "travel").map((p) => p.title)).toEqual([
      "Apple",
      "Zebra",
    ]);
  });
});

describe("newsByDate", () => {
  it("returns news newest first", () => {
    const pages = [
      make({ section: "news", slug: "old", publishedAt: "2025-02-14" }),
      make({ section: "news", slug: "new", publishedAt: "2026-05-01" }),
      make({ section: "travel", slug: "not-news" }),
    ];
    expect(newsByDate(pages).map((p) => p.slug)).toEqual(["new", "old"]);
  });
});

describe("findPage", () => {
  it("finds by section and slug, ignores drafts", () => {
    const pages = [
      make({ slug: "target" }),
      make({ slug: "hidden", draft: true }),
    ];
    expect(findPage(pages, "travel", "target")?.slug).toBe("target");
    expect(findPage(pages, "travel", "hidden")).toBeUndefined();
    expect(findPage(pages, "business", "target")).toBeUndefined();
  });
});

describe("formatDate", () => {
  it("formats ISO dates for display", () => {
    expect(formatDate("2025-02-14")).toBe("14 February 2025");
  });

  it("returns empty string for missing or bad input", () => {
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("not-a-date")).toBe("");
  });
});
