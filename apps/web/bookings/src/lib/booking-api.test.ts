import { inspect } from "node:util";
import { ResponseError } from "@barrelsgd/api-client";
import { describe, expect, it, vi } from "vitest";

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

describe("booking-api errors", () => {
  it("never carries the visitor secret in a thrown ResponseError", async () => {
    let sent: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        sent = request;
        return Promise.resolve(new Response("{}", { status: 429 }));
      })
    );
    const { getAvailability } = await import("@/lib/booking-api");
    const error = await getAvailability("shop", "svc", "2026-01-01").catch(
      (caught: unknown) => caught
    );
    vi.unstubAllGlobals();
    expect(error).toBeInstanceOf(ResponseError);
    expect(sent?.headers.get("x-visitor-secret")).toContain("fake-secret");
    expect(inspect(error, { depth: 6 })).not.toContain("fake-secret");
  });
});
