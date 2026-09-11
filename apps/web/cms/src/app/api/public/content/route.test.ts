import { describe, expect, it, vi } from "vitest";

vi.mock("payload", () => ({ getPayload: vi.fn() }));
vi.mock("../../../../payload.config", () => ({ default: {} }));

import { getPayload } from "payload";
import { GET } from "./route";

function request(url: string) {
  return new Request(url);
}

function doc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    title: "Season preparation",
    slug: "season-preparation",
    kind: "article",
    summary: "Get ready",
    body: "# Prepare",
    image: { url: "/media/prepare.jpg" },
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("public content feed", () => {
  it("returns published articles with resolved image URLs", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [doc()] });
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const response = await GET(request("http://localhost/api/public/content"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.articles).toEqual([
      {
        id: "1",
        title: "Season preparation",
        slug: "season-preparation",
        kind: "article",
        summary: "Get ready",
        body: "# Prepare",
        imageUrl: "/media/prepare.jpg",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
    ]);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "content",
        overrideAccess: false,
        where: { status: { equals: "published" } },
      })
    );
  });
  it("falls back to null when the image has not been resolved", async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ docs: [doc({ image: undefined })] });
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const response = await GET(request("http://localhost/api/public/content"));
    const body = await response.json();
    expect(body.articles[0].imageUrl).toBeNull();
  });
  it("rejects unknown content kinds", async () => {
    const response = await GET(
      request("http://localhost/api/public/content?kind=bogus")
    );
    expect(response.status).toBe(400);
  });
  it("reports unavailable when Payload cannot be reached", async () => {
    vi.mocked(getPayload).mockRejectedValue(new Error("db down"));
    const response = await GET(request("http://localhost/api/public/content"));
    expect(response.status).toBe(503);
  });
});

for (const placement of ["latest", "news"]) {
  it(`filters published ${placement} content and includes both`, async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    vi.mocked(getPayload).mockResolvedValue({ find } as never);
    const response = await GET(
      request(
        `http://localhost/api/public/content?kind=article&placement=${placement}`
      )
    );
    expect(response.status).toBe(200);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { equals: "published" },
          kind: { equals: "article" },
          placement: { in: [placement, "both"] },
        },
      })
    );
  });
}
it("rejects unknown placement", async () => {
  const response = await GET(
    request("http://localhost/api/public/content?placement=bogus")
  );
  expect(response.status).toBe(400);
});
