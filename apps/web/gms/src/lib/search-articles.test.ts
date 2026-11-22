import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((fn: unknown) => fn),
}));
vi.mock("@/lib/cms", () => ({
  contentHref: () => "/explore/news/example",
  fetchPublishedContent: vi.fn(),
}));

const { SEARCH_ARTICLES_REVALIDATE_SECONDS, searchArticles } = await import(
  "@/lib/search-articles"
);

describe("search article cache", () => {
  it("keeps the CMS article list for five minutes, so search does not reach the CMS per request", async () => {
    // Load the module afresh so the cache wrapper is called in this test.
    vi.resetModules();
    const cache = await import("next/cache");
    await import("@/lib/search-articles");
    expect(cache.unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["gms-search-articles"],
      { revalidate: SEARCH_ARTICLES_REVALIDATE_SECONDS }
    );
    expect(SEARCH_ARTICLES_REVALIDATE_SECONDS).toBe(300);
  });
});

describe("searchArticles", () => {
  it("maps an unavailable CMS to no articles, so menu pages still search", () => {
    expect(searchArticles({ status: "unavailable", articles: [] })).toEqual([]);
  });
});
