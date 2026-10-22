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

  it("sends the visitor headers and the bearer with a code request, and never leaks them", async () => {
    let sent: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        sent = request;
        return Promise.resolve(new Response("{}", { status: 503 }));
      })
    );
    const { requestEmailCode } = await import("@/lib/booking-api");
    const error = await requestEmailCode(
      "shop",
      {
        service_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
        starts_at: "2027-01-05T13:30:00Z",
        customer_email: "ada@example.com",
      },
      "access-token-123"
    ).catch((caught: unknown) => caught);
    vi.unstubAllGlobals();
    expect(error).toBeInstanceOf(ResponseError);
    expect(sent?.url).toContain("/bookings/public/shop/email-code");
    expect(sent?.method).toBe("POST");
    expect(sent?.headers.get("authorization")).toBe("Bearer access-token-123");
    expect(sent?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
    const text = inspect(error, { depth: 6 });
    expect(text).not.toContain("fake-secret");
    expect(text).not.toContain("access-token-123");
  });

  it("sends the code confirmation to its own endpoint without a bearer", async () => {
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
    const proof = await confirmEmailCode("shop", {
      service_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
      starts_at: "2027-01-05T13:30:00Z",
      customer_email: "ada@example.com",
      code: "123456",
    });
    vi.unstubAllGlobals();
    expect(proof.proof).toBe("p");
    expect(sent?.url).toContain("/bookings/public/shop/email-code/confirm");
    expect(sent?.headers.get("authorization")).toBeNull();
  });

  it("keeps the idempotency key and adds the bearer on create", async () => {
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
      "shop",
      {
        service_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
        starts_at: "2027-01-05T13:30:00Z",
        customer_email: "ada@example.com",
        customer_name: "Ada",
        marketing_consent: false,
        email_proof: "proof-1",
      },
      "11111111-1111-4111-8111-111111111111",
      "access-token-123"
    ).catch(() => undefined);
    vi.unstubAllGlobals();
    expect(sent?.headers.get("idempotency-key")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(sent?.headers.get("authorization")).toBe("Bearer access-token-123");
  });
});
