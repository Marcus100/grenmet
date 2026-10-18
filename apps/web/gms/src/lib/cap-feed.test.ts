// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyCapFeed } from "@/lib/cap-feed";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxyCapFeed", () => {
  it("passes the upstream feed through with its content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<rss/>", {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          })
      )
    );
    const response = await proxyCapFeed("/api/cap/rss.xml", "text/xml");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/rss+xml");
    expect(await response.text()).toBe("<rss/>");
    expect(response.headers.get("cache-control")).toContain(
      "stale-if-error=86400"
    );
  });

  it("never caches an upstream error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );
    const response = await proxyCapFeed("/api/cap/rss.xml", "text/xml");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503, never an empty feed, when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("down")))
    );
    const response = await proxyCapFeed("/api/cap/rss.xml", "text/xml");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
