import { describe, expect, it, vi } from "vitest";

vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("payload")>()),
  getPayload: vi.fn(),
}));
vi.mock("../../../../payload.config", () => ({ default: {} }));
vi.mock("../../../../lib/report-error", () => ({ reportError: vi.fn() }));

import { getPayload } from "payload";
import { GET } from "./route";

function story(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Why the sky turns hazy",
    slug: "stories/2026/09/why-the-sky-turns-hazy",
    kind: "explainer",
    summary: "Saharan dust",
    body: "Dust from Africa.",
    image: { url: "/media/haze.jpg", alt: "Haze", credit: "GMS" },
    topics: ["sky"],
    publishedAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    status: "published",
    author: { id: 9, email: "PRIVATE@example.test" },
    ...overrides,
  };
}

describe("public articles feed", () => {
  it("returns published articles with labels, never staff fields", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [story()] });
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const response = await GET(
      new Request("http://localhost/api/public/articles?collection=stories")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { articles } = await response.json();
    expect(articles[0]).toMatchObject({
      id: "1",
      collection: "stories",
      category: "Explainer",
      imageUrl: "/media/haze.jpg",
      imageCredit: "GMS",
      topics: ["sky"],
    });
    expect(JSON.stringify(articles)).not.toContain("PRIVATE");
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "stories",
        overrideAccess: false,
        where: { status: { equals: "published" } },
      })
    );
  });

  it("finds one slug across every article collection", async () => {
    const find = vi.fn(({ collection }: { collection: string }) =>
      Promise.resolve({
        docs:
          collection === "desk-updates"
            ? [
                {
                  ...story({ slug: "updates/2026/09/new-marine-page" }),
                  kind: "product-update",
                },
              ]
            : [],
      })
    );
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const response = await GET(
      new Request(
        "http://localhost/api/public/articles?slug=updates/2026/09/new-marine-page"
      )
    );
    const { articles } = await response.json();
    expect(find).toHaveBeenCalledTimes(3);
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      collection: "desk-updates",
      category: "Product update",
    });
    expect(articles[0]).not.toHaveProperty("document");
  });

  it("rejects unknown collections and reports outages as 503", async () => {
    expect(
      (
        await GET(
          new Request("http://localhost/api/public/articles?collection=users")
        )
      ).status
    ).toBe(400);
    vi.mocked(getPayload).mockRejectedValue(new Error("down"));
    expect(
      (await GET(new Request("http://localhost/api/public/articles"))).status
    ).toBe(503);
  });
});
