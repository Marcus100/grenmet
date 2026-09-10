import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { CMS_API_URL: "http://cms.example.test" },
}));

import { fetchContentBySlug, fetchPublishedContent } from "@/lib/cms";

function article(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "1",
    title: "Season preparation",
    slug: "season-preparation",
    kind: "article",
    summary: "Get ready",
    body: "# Prepare",
    imageUrl: null,
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("published content feed", () => {
  it("fetches published articles without caching", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ articles: [article()] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchPublishedContent("article");
    expect(result.status).toBe("ok");
    expect(result.articles).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("http://cms.example.test/api/public/content?kind=article"),
      expect.objectContaining({ cache: "no-store" })
    );
  });
  it("distinguishes a service outage from an empty feed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "offline" }, { status: 503 }))
    );
    expect((await fetchPublishedContent()).status).toBe("unavailable");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ articles: [] }))
    );
    expect(await fetchPublishedContent()).toEqual({
      status: "ok",
      articles: [],
    });
  });
  it("rejects malformed articles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ articles: [{ title: "x" }] }))
    );
    expect((await fetchPublishedContent()).status).toBe("unavailable");
  });
  it("fetches a single article by slug", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ articles: [article()] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchContentBySlug("season-preparation");
    expect(result?.slug).toBe("season-preparation");
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "http://cms.example.test/api/public/content?slug=season-preparation"
      ),
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
