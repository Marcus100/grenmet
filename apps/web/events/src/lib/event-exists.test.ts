import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EVENT_ANSWER_TTL_MS,
  eventExists,
  forgetEventAnswers,
} from "@/lib/event-exists";

vi.mock("server-only", () => ({}));
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
  forgetEventAnswers();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("eventExists", () => {
  it("is true for a published event, asking as the visitor", async () => {
    answer(200);
    expect(await eventExists("spicemas-jouvert", visitor)).toBe(true);
    expect(sent[0]?.url).toBe(
      "http://api.test/api/v1/events/listings/spicemas-jouvert"
    );
    expect(sent[0]?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
    expect(sent[0]?.headers.get("authorization")).toBeNull();
  });

  it("is false when the API has no such event", async () => {
    answer(404);
    expect(await eventExists("gone", visitor)).toBe(false);
    forgetEventAnswers();
    answer(422);
    expect(await eventExists("gone", visitor)).toBe(false);
  });

  it("is null when the API cannot answer, and keeps that only a few seconds", async () => {
    answer(503);
    expect(await eventExists("spicemas", visitor, 1000)).toBeNull();
    sent = [];
    answer(200);
    // A stalled API is not asked again straight away.
    expect(await eventExists("spicemas", visitor, 1000 + 4000)).toBeNull();
    expect(sent).toHaveLength(0);
    expect(await eventExists("spicemas", visitor, 1000 + 5000)).toBe(true);
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
    expect(await eventExists("slow-event", visitor)).toBeNull();
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps a missing answer briefly, so a new event shows within seconds", async () => {
    answer(404);
    expect(await eventExists("soon", visitor, 1000)).toBe(false);
    expect(await eventExists("soon", visitor, 1000 + 9000)).toBe(false);
    expect(sent).toHaveLength(1);
    answer(200);
    expect(
      await eventExists("soon", visitor, 1000 + EVENT_ANSWER_TTL_MS.missing)
    ).toBe(true);
  });

  it("keeps a found event for a minute, then asks again", async () => {
    answer(200);
    expect(await eventExists("here", visitor, 1000)).toBe(true);
    expect(await eventExists("here", visitor, 1000 + 59_000)).toBe(true);
    expect(sent).toHaveLength(1);
    answer(404);
    expect(
      await eventExists("here", visitor, 1000 + EVENT_ANSWER_TTL_MS.exists)
    ).toBe(false);
  });
});
