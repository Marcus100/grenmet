import { inspect } from "node:util";
import { ResponseError } from "@barrelsgd/api-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));
vi.mock("@/env", () => ({
  env: {
    BABYDOLL_API_URL: "http://api.test",
    BABYDOLL_BOOKING_SLUG: "babydoll-beauty-bar",
    TRUSTED_WEB_SECRET: "fake-secret-fake-secret-fake-secret-0",
    VISITOR_IP_PROXY_HOPS: 1,
  },
}));

const body = {
  service_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
  starts_at: "2027-01-05T13:30:00Z",
  customer_email: "ada@example.com",
};

describe("booking-api email code", () => {
  it("posts the request for the studio with the visitor headers, and never leaks the secret", async () => {
    let sent: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        sent = request;
        return Promise.resolve(new Response("{}", { status: 503 }));
      })
    );
    const { requestEmailCode } = await import("@/lib/booking-api");
    const error = await requestEmailCode(body).catch(
      (caught: unknown) => caught
    );
    vi.unstubAllGlobals();

    expect(error).toBeInstanceOf(ResponseError);
    expect(sent?.method).toBe("POST");
    expect(sent?.url).toContain(
      "/bookings/public/babydoll-beauty-bar/email-code"
    );
    expect(sent?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
    expect(sent?.headers.get("x-visitor-secret")).toContain("fake-secret");
    expect(inspect(error, { depth: 6 })).not.toContain("fake-secret");
  });

  it("posts the confirmation to its own endpoint and returns the proof", async () => {
    let sent: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        sent = request;
        return Promise.resolve(
          Response.json({ proof: "p", expires_in_seconds: 900 })
        );
      })
    );
    const { confirmEmailCode } = await import("@/lib/booking-api");
    const proof = await confirmEmailCode({ ...body, code: "123456" });
    vi.unstubAllGlobals();

    expect(proof.proof).toBe("p");
    expect(sent?.url).toContain("/email-code/confirm");
  });

  it("keeps the idempotency key on create", async () => {
    let sent: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        sent = request;
        return Promise.resolve(new Response("{}", { status: 403 }));
      })
    );
    const { createBooking } = await import("@/lib/booking-api");
    await createBooking(
      {
        ...body,
        customer_name: "Ada",
        marketing_consent: false,
        email_proof: "proof-1",
      },
      "11111111-1111-4111-8111-111111111111"
    ).catch(() => undefined);
    vi.unstubAllGlobals();

    expect(sent?.headers.get("idempotency-key")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
