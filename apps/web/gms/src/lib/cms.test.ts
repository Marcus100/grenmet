import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { CMS_API_URL: "http://cms.example.test" },
}));

import {
  fetchContentBySlug,
  fetchHomeContent,
  fetchPublishedContent,
} from "@/lib/cms";

function article(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "1",
    collection: "stories",
    title: "Season preparation",
    slug: "stories/2026/09/season-preparation",
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
    const result = await fetchPublishedContent();
    expect(result.status).toBe("ok");
    expect(result.articles).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("http://cms.example.test/api/public/articles"),
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
  it("rejects executable URLs in editorial links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          articles: [
            article({
              relatedLinks: [
                {
                  title: "Unsafe",
                  category: "source",
                  url: "javascript:alert(1)",
                },
              ],
            }),
          ],
        })
      )
    );
    expect((await fetchPublishedContent()).status).toBe("unavailable");
  });
  it("fetches a single article by slug", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ articles: [article()] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchContentBySlug(
      "stories/2026/09/season-preparation"
    );
    expect(result.status).toBe("ok");
    expect(result.articles[0]?.collection).toBe("stories");
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "http://cms.example.test/api/public/articles?slug=stories%2F2026%2F09%2Fseason-preparation"
      ),
      expect.objectContaining({ cache: "no-store" })
    );
  });
});

it("asks CMS for one collection", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ articles: [] }));
  vi.stubGlobal("fetch", fetcher);
  await fetchPublishedContent("publications");
  expect(fetcher).toHaveBeenCalledWith(
    new URL(
      "http://cms.example.test/api/public/articles?collection=publications"
    ),
    expect.anything()
  );
});

describe("home feed", () => {
  it("keeps each section's own state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          deskUpdates: { status: "ok", items: [] },
          stories: { status: "unavailable" },
          publications: {
            status: "ok",
            items: [article({ collection: "publications" })],
          },
        })
      )
    );
    const home = await fetchHomeContent();
    expect(home.deskUpdates).toEqual({ status: "ok", articles: [] });
    expect(home.stories.status).toBe("unavailable");
    expect(home.publications.articles).toHaveLength(1);
  });
  it("reports every section unavailable when the CMS is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({}, { status: 503 }))
    );
    const home = await fetchHomeContent();
    expect(Object.values(home).map((part) => part.status)).toEqual([
      "unavailable",
      "unavailable",
      "unavailable",
    ]);
  });
});
