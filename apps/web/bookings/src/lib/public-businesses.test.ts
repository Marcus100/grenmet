import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { getPublicBusinesses } from "@/lib/public-businesses";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));
vi.mock("@/env", () => ({
  env: {
    AUTH_API_URL: "http://api.test",
    TRUSTED_WEB_SECRET: "fake-secret-fake-secret-fake-secret-0",
    VISITOR_IP_PROXY_HOPS: 1,
  },
}));
const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError }));

const PAGE = {
  items: [],
  page: 2,
  has_more: false,
  categories: ["Hair"],
};

describe("getPublicBusinesses", () => {
  it("asks the public listing for the query, with the visitor's own address", async () => {
    let sent: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        sent = request;
        return Promise.resolve(Response.json(PAGE));
      })
    );
    const result = await getPublicBusinesses({
      q: "fade",
      category: "Hair",
      type: "hair",
      page: 2,
    });
    vi.unstubAllGlobals();

    expect(result).toEqual(PAGE);
    expect(sent?.method).toBe("GET");
    const url = new URL(sent?.url ?? "");
    expect(url.pathname).toBe("/api/v1/bookings/public/businesses");
    expect(url.searchParams.get("q")).toBe("fade");
    expect(url.searchParams.get("category")).toBe("Hair");
    expect(url.searchParams.get("type")).toBe("hair");
    expect(url.searchParams.get("page")).toBe("2");
    expect(sent?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
  });

  it("answers null, reports the failure and never leaks the visitor secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 500 })))
    );
    const result = await getPublicBusinesses({
      q: undefined,
      category: undefined,
      type: undefined,
      page: 1,
    });
    vi.unstubAllGlobals();

    expect(result).toBeNull();
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      "bookings-home"
    );
    const [error] = reportError.mock.calls[0] ?? [];
    expect(inspect(error, { depth: 6 })).not.toContain("fake-secret");
  });
});
