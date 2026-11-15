import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingLinkExists } from "@/lib/booking-link-exists";

vi.mock("@/env", () => ({
  env: {
    AUTH_API_URL: "http://api.test",
    TRUSTED_WEB_SECRET: "fake-secret-fake-secret-fake-secret-0",
    VISITOR_IP_PROXY_HOPS: 1,
  },
}));

const visitor = new Headers({ "x-forwarded-for": "203.0.113.7" });
let sent: Request[] = [];

function answer(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn((request: Request) => {
      sent.push(request);
      return Promise.resolve(
        new Response(status === 200 ? "{}" : '{"detail":"x"}', {
          status,
          headers: { "content-type": "application/json" },
        })
      );
    })
  );
}

beforeEach(() => {
  sent = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bookingLinkExists", () => {
  it("is true for a booking the API knows, asking as the visitor", async () => {
    answer(200);
    expect(await bookingLinkExists("tok-123", visitor)).toBe(true);
    expect(sent[0]?.url).toBe(
      "http://api.test/api/v1/bookings/public/bookings/tok-123"
    );
    expect(sent[0]?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
  });

  it("is false when the API has no such booking or cannot read the token", async () => {
    answer(404);
    expect(await bookingLinkExists("gone", visitor)).toBe(false);
    answer(422);
    expect(await bookingLinkExists("x", visitor)).toBe(false);
  });

  it("is null when the API cannot answer, and does not remember the token", async () => {
    answer(503);
    expect(await bookingLinkExists("tok-123", visitor)).toBeNull();
    answer(200);
    expect(await bookingLinkExists("tok-123", visitor)).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("gives the API a deadline, and treats running out of time as unknown", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        signal = request.signal;
        return Promise.reject(
          new DOMException("The operation timed out.", "TimeoutError")
        );
      })
    );
    expect(await bookingLinkExists("tok-123", visitor)).toBeNull();
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
