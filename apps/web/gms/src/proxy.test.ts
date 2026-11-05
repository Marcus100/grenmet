// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cmsItemExists } from "@/lib/cms-item-exists";
import { config, NOT_FOUND_PATH, proxy } from "@/proxy";

vi.mock("@/lib/cms-item-exists", () => ({ cmsItemExists: vi.fn() }));
const exists = vi.mocked(cmsItemExists);

function request(path: string, headers: HeadersInit = {}) {
  return new NextRequest(`http://localhost:3003${path}`, { headers });
}

/** Where a rewrite sends the request, or null when the proxy did not rewrite. */
function rewrittenTo(response: Response): string | null {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
}

beforeEach(() => {
  exists.mockReset();
  exists.mockResolvedValue(true);
});

describe("proxy: CMS items", () => {
  it("answers a missing item with the not-found page, status 404", async () => {
    exists.mockResolvedValue(false);
    for (const path of [
      "/explore/news/no-such-story",
      "/explore/updates/2026/10/30/gone",
      "/explore/reports/q9",
      "/explore/explained/no-such-question",
      "/explore/quiz/no-such-quiz",
    ]) {
      const response = await proxy(request(path));
      expect(response.status, path).toBe(404);
      expect(rewrittenTo(response), path).toBe(NOT_FOUND_PATH);
    }
    expect(exists).toHaveBeenCalledWith({
      endpoint: "quizzes",
      slug: "discover/no-such-quiz",
    });
  });

  it("lets an item the CMS has through", async () => {
    const response = await proxy(request("/explore/news/2026/09/a-wet-week"));
    expect(response.status).toBe(200);
    expect(rewrittenTo(response)).toBeNull();
  });

  it("leaves the page to decide when the CMS cannot answer", async () => {
    exists.mockResolvedValue(null);
    const response = await proxy(request("/explore/news/x"));
    expect(response.status).toBe(200);
    expect(rewrittenTo(response)).toBeNull();
  });

  it("leaves client navigations and other paths alone without asking", async () => {
    exists.mockResolvedValue(false);
    for (const [path, headers] of [
      ["/explore/news/gone", { RSC: "1" }],
      ["/explore/explained/a/b", {}],
      ["/explore", {}],
    ] as const) {
      const response = await proxy(request(path, headers));
      expect(response.status, path).toBe(200);
      expect(rewrittenTo(response), path).toBeNull();
    }
    expect(exists).not.toHaveBeenCalled();
  });

  it("runs only on the CMS item addresses", () => {
    expect(config.matcher).toEqual([
      "/explore/news/:path+",
      "/explore/updates/:path+",
      "/explore/reports/:path+",
      "/explore/explained/:slug",
      "/explore/quiz/:slug",
    ]);
  });
});
