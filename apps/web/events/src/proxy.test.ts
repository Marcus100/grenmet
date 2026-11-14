// @vitest-environment node
import { readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventExists } from "@/lib/event-exists";
import { config, EVENTS_PAGES, NOT_FOUND_PATH, proxy } from "@/proxy";

vi.mock("@/lib/event-exists", () => ({ eventExists: vi.fn() }));
const exists = vi.mocked(eventExists);

function request(address: string, headers: HeadersInit = {}, method = "GET") {
  return new NextRequest(`http://localhost:3009${address}`, {
    headers,
    method,
  });
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

describe("proxy: event pages", () => {
  it("answers a missing event with the not-found page, status 404", async () => {
    exists.mockResolvedValue(false);
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(
        request("/events/staging-journey-no-such-event", {}, method)
      );
      expect(response.status, method).toBe(404);
      expect(rewrittenTo(response), method).toBe(NOT_FOUND_PATH);
    }
    expect(exists).toHaveBeenCalledWith(
      "staging-journey-no-such-event",
      expect.anything()
    );
  });

  it("answers a path that cannot be an event without asking the API", async () => {
    for (const address of ["/events/Not-A-Slug", "/events/-bad", "/events/a"]) {
      const response = await proxy(request(address));
      expect(response.status, address).toBe(404);
      expect(rewrittenTo(response), address).toBe(NOT_FOUND_PATH);
    }
    expect(exists).not.toHaveBeenCalled();
  });

  it("lets a published event through", async () => {
    const response = await proxy(request("/events/spicemas-jouvert"));
    expect(response.status).toBe(200);
    expect(rewrittenTo(response)).toBeNull();
  });

  it("lets the page decide when the API cannot answer", async () => {
    exists.mockResolvedValue(null);
    const response = await proxy(request("/events/spicemas-jouvert"));
    expect(response.status).toBe(200);
    expect(rewrittenTo(response)).toBeNull();
  });

  it("leaves client navigations, other pages and deeper paths alone without asking", async () => {
    exists.mockResolvedValue(false);
    for (const [address, headers] of [
      ["/events/gone-event", { RSC: "1" }],
      ["/events/suggest", {}],
      ["/events/gone-event/ics", {}],
      ["/events", {}],
      ["/groups/gone-group", {}],
    ] as const) {
      const response = await proxy(request(address, headers));
      expect(response.status, address).toBe(200);
      expect(rewrittenTo(response), address).toBeNull();
    }
    const post = await proxy(request("/events/gone-event", {}, "POST"));
    expect(rewrittenTo(post)).toBeNull();
    expect(exists).not.toHaveBeenCalled();
  });

  it("runs only on the event pages", () => {
    expect(config.matcher).toEqual(["/events/:slug"]);
  });
});

describe("EVENTS_PAGES", () => {
  it("lists every page under /events/ that is not an event", () => {
    const eventsDir = path.resolve(import.meta.dirname, "app/(public)/events");
    const pages = readdirSync(eventsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("["))
      .map((entry) => entry.name)
      .sort();
    expect(pages.length).toBeGreaterThan(0);
    expect([...EVENTS_PAGES].sort()).toEqual(pages);
  });
});
