import { describe, expect, it } from "vitest";
import {
  type ArticleLike,
  bySection,
  findArticle,
  publishedArticles,
  sortBriefsDesc,
} from "./content-utils";

const articles: ArticleLike[] = [
  {
    section: "weather-ready",
    slug: "older",
    publishedAt: "2026-06-10",
    draft: false,
  },
  {
    section: "weather-ready",
    slug: "newer",
    publishedAt: "2026-06-13",
    draft: false,
  },
  {
    section: "opportunity",
    slug: "a-draft",
    publishedAt: "2026-06-14",
    draft: true,
  },
  {
    section: "opportunity",
    slug: "live",
    publishedAt: "2026-06-12",
    draft: false,
  },
];

describe("publishedArticles", () => {
  it("drops drafts and sorts newest first", () => {
    const result = publishedArticles(articles);
    expect(result.map((a) => a.slug)).toEqual(["newer", "live", "older"]);
  });
});

describe("bySection", () => {
  it("returns only published articles for a section, newest first", () => {
    const result = bySection(articles, "weather-ready");
    expect(result.map((a) => a.slug)).toEqual(["newer", "older"]);
  });
});

describe("findArticle", () => {
  it("finds a published article by section and slug", () => {
    expect(findArticle(articles, "opportunity", "live")?.slug).toBe("live");
  });

  it("does not return drafts", () => {
    expect(findArticle(articles, "opportunity", "a-draft")).toBeUndefined();
  });
});

describe("sortBriefsDesc", () => {
  it("sorts briefs newest first", () => {
    const briefs = [{ date: "2026-06-10" }, { date: "2026-06-13" }];
    expect(sortBriefsDesc(briefs).map((b) => b.date)).toEqual([
      "2026-06-13",
      "2026-06-10",
    ]);
  });
});
