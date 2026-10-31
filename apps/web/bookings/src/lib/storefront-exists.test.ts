import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetStorefrontAnswers,
  STOREFRONT_ANSWER_TTL_MS,
  STOREFRONT_UNKNOWN_TTL_MS,
  storefrontExists,
} from "@/lib/storefront-exists";

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
  forgetStorefrontAnswers();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storefrontExists", () => {
  it("is true for a business the API knows, asking as the visitor", async () => {
    answer(200);
    expect(await storefrontExists("sea-salt", visitor)).toBe(true);
    expect(sent[0]?.url).toBe(
      "http://api.test/api/v1/bookings/public/sea-salt"
    );
    expect(sent[0]?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
  });

  it("is false when the API has no such business", async () => {
    answer(404);
    expect(await storefrontExists("gone", visitor)).toBe(false);
    forgetStorefrontAnswers();
    answer(422);
    expect(await storefrontExists("gone", visitor)).toBe(false);
  });

  it("is null when the API cannot answer, and keeps that only a few seconds", async () => {
    answer(503);
    expect(await storefrontExists("sea-salt", visitor, 1000)).toBeNull();
    sent = [];
    answer(200);
    // A stalled API is not asked again straight away.
    expect(await storefrontExists("sea-salt", visitor, 1000 + 4000)).toBeNull();
    expect(sent).toHaveLength(0);
    expect(
      await storefrontExists(
        "sea-salt",
        visitor,
        1000 + STOREFRONT_UNKNOWN_TTL_MS
      )
    ).toBe(true);
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
    expect(await storefrontExists("slow-shop", visitor)).toBeNull();
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("refreshing a kept answer when full drops no other live answer", async () => {
    answer(200);
    await storefrontExists("first", visitor, 0);
    for (let index = 1; index < 500; index += 1) {
      await storefrontExists(`shop-${index}`, visitor, 0);
    }
    // shop-250 has expired and is asked again: nothing new is added, so
    // nothing else may be dropped.
    await storefrontExists("shop-250", visitor, STOREFRONT_ANSWER_TTL_MS);
    sent = [];
    await storefrontExists("first", visitor, STOREFRONT_ANSWER_TTL_MS - 1);
    expect(sent).toHaveLength(0);
  });

  it("keeps a definite answer for a minute, then asks again", async () => {
    answer(404);
    expect(await storefrontExists("gone", visitor, 1000)).toBe(false);
    expect(await storefrontExists("gone", visitor, 1000 + 59_000)).toBe(false);
    expect(sent).toHaveLength(1);
    answer(200);
    expect(
      await storefrontExists("gone", visitor, 1000 + STOREFRONT_ANSWER_TTL_MS)
    ).toBe(true);
  });
});
