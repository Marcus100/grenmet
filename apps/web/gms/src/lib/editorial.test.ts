import { describe, expect, it } from "vitest";
import { contentHref, type PublishedContent } from "@/lib/cms";
import { contentToArticle } from "@/lib/editorial";

const post: PublishedContent = {
  id: "11111111-1111-4111-8111-111111111111",
  collection: "desk-updates",
  title: "Showers ease",
  slug: "showers-ease",
  summary: "Showers ease over the islands.",
  body: "Full text.",
  imageUrl: null,
  updatedAt: "2026-10-30T02:30:00Z",
  publishedAt: "2026-10-30T02:30:00Z",
  linkedProduct: null,
};

describe("contentToArticle", () => {
  it("dates an article in Grenada time, not the server's time zone", () => {
    // 02:30 UTC on 30 Oct is 22:30 on 29 Oct in Grenada (UTC-4).
    expect(contentToArticle(post).published).toBe("29 October 2026");
  });

  it("falls back to the last update when nothing was published yet", () => {
    const draftish = { ...post, publishedAt: null };
    expect(contentToArticle(draftish).published).toBe("29 October 2026");
  });

  it("carries the article's own text through", () => {
    const article = contentToArticle(post);
    expect(article.title).toBe("Showers ease");
    expect(article.summary).toBe("Showers ease over the islands.");
    expect(article.href).toBe(contentHref(post));
  });
});

it("ships no sample posts", async () => {
  const exported = Object.keys(await import("@/lib/editorial"));
  expect(exported).not.toContain("REFERENCE_POSTS");
  expect(exported).not.toContain("WEATHER_ARTICLES");
  expect(exported).not.toContain("productPost");
});
