import { describe, expect, it } from "vitest";
import {
  articleBreadcrumbJsonLd,
  articleImageUrl,
  newsArticleJsonLd,
} from "./article-jsonld";

const SITE = "https://signal.barrels.gd";
const PRIVATE_FIELDS = /token|session|email/u;

const article = {
  author: "Signal desk",
  dek: "What changed this week.",
  publishedAt: "2026-06-13",
  section: "sport",
  slug: "carib-cup",
  title: "The Carib Cup",
};

describe("newsArticleJsonLd", () => {
  it("names the headline, dates, author and publisher with absolute URLs", () => {
    const data = newsArticleJsonLd(SITE, article);
    expect(data).toMatchObject({
      "@type": "NewsArticle",
      headline: "The Carib Cup",
      description: "What changed this week.",
      datePublished: "2026-06-13",
      mainEntityOfPage: "https://signal.barrels.gd/sport/carib-cup",
      author: { "@type": "Person", name: "Signal desk" },
      publisher: { "@type": "Organization", name: "Grenada Signal" },
    });
  });

  it("is valid JSON with no secrets or session fields", () => {
    const text = JSON.stringify(newsArticleJsonLd(SITE, article));
    expect(JSON.parse(text)).toBeTruthy();
    expect(text).not.toMatch(PRIVATE_FIELDS);
  });
});

describe("articleImageUrl", () => {
  it("returns nothing for an article without an image on this site", () => {
    expect(articleImageUrl(SITE, "sport", "not-a-real-story")).toBeUndefined();
  });
});

describe("articleBreadcrumbJsonLd", () => {
  it("builds Signal > section > article with absolute URLs", () => {
    const data = articleBreadcrumbJsonLd(SITE, article) as {
      itemListElement: { item: string; name: string; position: number }[];
    };
    expect(data.itemListElement.map((step) => step.item)).toEqual([
      "https://signal.barrels.gd/",
      "https://signal.barrels.gd/sport",
      "https://signal.barrels.gd/sport/carib-cup",
    ]);
    expect(data.itemListElement.map((step) => step.position)).toEqual([
      1, 2, 3,
    ]);
  });
});
