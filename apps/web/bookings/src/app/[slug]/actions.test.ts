import { ResponseError } from "@barrelsgd/api-client";
import type { BookingInput } from "@barrelsgd/bookings-web/lib/booking-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmEmailCode as confirmCode,
  createBooking,
  getAvailability,
  requestEmailCode as requestCode,
} from "@/lib/booking-api";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import {
  confirmEmailCode,
  loadSlots,
  requestEmailCode,
  submitBooking,
} from "./actions";

vi.mock("@/lib/booking-api", () => ({
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
  requestEmailCode: vi.fn(),
  confirmEmailCode: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const SLUG = "sea-salt-spa";

const input: BookingInput = {
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  serviceId: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
  startsAt: "2027-01-05T13:30:00Z",
  name: " Ada Lovelace ",
  email: "ada@example.com",
  phone: "",
  notes: "",
  marketingConsent: false,
  website: "",
  turnstileToken: "",
};

function apiError(status: number, detail: string) {
  return new ResponseError({
    data: { detail },
    status,
    statusText: "",
    request: new Request("http://api.test/x"),
    response: new Response(null, { status }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSession).mockResolvedValue(null);
});

describe("submitBooking", () => {
  it("refuses a malformed slug without calling the API", async () => {
    expect(await submitBooking("Not A Slug", input)).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("sends the trimmed request for the slug with the idempotency key", async () => {
    vi.mocked(createBooking).mockResolvedValue({
      booking: {} as never,
      manage_token: "tok",
      manage_url: null,
    });
    const outcome = await submitBooking(SLUG, input);

    expect(outcome).toEqual({
      ok: true,
      data: { booking: {}, manageToken: "tok" },
    });
    expect(createBooking).toHaveBeenCalledWith(
      SLUG,
      {
        service_id: input.serviceId,
        starts_at: input.startsAt,
        customer_name: "Ada Lovelace",
        customer_email: "ada@example.com",
        marketing_consent: false,
      },
      input.idempotencyKey,
      undefined
    );
  });

  it("passes the Turnstile token and a filled honeypot through for the API to judge", async () => {
    vi.mocked(createBooking).mockResolvedValue({
      booking: {} as never,
      manage_token: "tok",
      manage_url: null,
    });
    await submitBooking(SLUG, {
      ...input,
      turnstileToken: " cf-token ",
      website: "http://spam.example",
    });
    expect(createBooking).toHaveBeenCalledWith(
      SLUG,
      expect.objectContaining({
        turnstile_token: "cf-token",
        website: "http://spam.example",
      }),
      input.idempotencyKey,
      undefined
    );
  });

  it("sends the email proof and the signed-in bearer, with the same idempotency key", async () => {
    vi.mocked(getSession).mockResolvedValue({
      accessToken: "access-1",
      email: "ada@example.com",
      name: "Ada",
    });
    vi.mocked(createBooking).mockResolvedValue({
      booking: {} as never,
      manage_token: "tok",
      manage_url: null,
    });
    await submitBooking(SLUG, { ...input, emailProof: "proof-1" });
    expect(createBooking).toHaveBeenCalledWith(
      SLUG,
      expect.objectContaining({ email_proof: "proof-1" }),
      input.idempotencyKey,
      "access-1"
    );
  });

  it("books as a visitor and reports it when the session lookup fails", async () => {
    const fault = new Error("auth api down");
    vi.mocked(getSession).mockRejectedValue(fault);
    vi.mocked(createBooking).mockResolvedValue({
      booking: {} as never,
      manage_token: "tok",
      manage_url: null,
    });
    const outcome = await submitBooking(SLUG, input);
    expect(outcome.ok).toBe(true);
    expect(reportError).toHaveBeenCalledWith(fault, "bookings-public-session");
    expect(vi.mocked(createBooking).mock.calls[0]?.[3]).toBeUndefined();
  });

  it("rejects a bad idempotency key or email before any call", async () => {
    expect(
      await submitBooking(SLUG, { ...input, idempotencyKey: "short" })
    ).toMatchObject({ ok: false, code: "invalid" });
    expect(
      await submitBooking(SLUG, { ...input, email: "not-an-email" })
    ).toMatchObject({ ok: false, code: "invalid" });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("maps a taken slot to slot_taken", async () => {
    vi.mocked(createBooking).mockRejectedValue(
      apiError(409, "Slot is no longer available")
    );
    expect(await submitBooking(SLUG, input)).toMatchObject({
      ok: false,
      code: "slot_taken",
    });
  });

  it("rethrows a non-API fault so a retry keeps the same key", async () => {
    vi.mocked(createBooking).mockRejectedValue(new Error("network down"));
    await expect(submitBooking(SLUG, input)).rejects.toHaveProperty(
      "message",
      "network down"
    );
  });
});

describe("loadSlots", () => {
  it("rejects bad ids and days", async () => {
    expect(await loadSlots(SLUG, "nope", "2027-01-05")).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it("returns the slots for the business", async () => {
    vi.mocked(getAvailability).mockResolvedValue({
      timezone: "America/Grenada",
      slots: [
        {
          starts_at: "2027-01-05T13:30:00Z",
          ends_at: "2027-01-05T14:30:00Z",
          provider_id: "p",
        },
      ],
    } as never);
    const outcome = await loadSlots(SLUG, input.serviceId, "2027-01-05");
    expect(getAvailability).toHaveBeenCalledWith(
      SLUG,
      input.serviceId,
      "2027-01-05"
    );
    expect(outcome).toEqual({
      ok: true,
      data: {
        timezone: "America/Grenada",
        slots: [
          {
            starts_at: "2027-01-05T13:30:00Z",
            ends_at: "2027-01-05T14:30:00Z",
          },
        ],
      },
    });
  });
});

describe("requestEmailCode", () => {
  const request = {
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    email: " ada@example.com ",
    turnstileToken: " cf-token ",
  };

  it("refuses a malformed slug and bad input before any call", async () => {
    expect(await requestEmailCode("Not A Slug", request)).toMatchObject({
      code: "not_found",
    });
    expect(
      await requestEmailCode(SLUG, { ...request, email: "nope" })
    ).toMatchObject({ code: "invalid" });
    expect(requestCode).not.toHaveBeenCalled();
  });

  it("sends the trimmed request with the Turnstile token and the signed-in bearer", async () => {
    vi.mocked(getSession).mockResolvedValue({
      accessToken: "access-1",
      email: "ada@example.com",
      name: "Ada",
    });
    vi.mocked(requestCode).mockResolvedValue({
      required: true,
      expires_in_seconds: 600,
    });
    const outcome = await requestEmailCode(SLUG, request);

    expect(outcome).toEqual({
      ok: true,
      data: { required: true, expiresInSeconds: 600 },
    });
    expect(requestCode).toHaveBeenCalledWith(
      SLUG,
      {
        service_id: input.serviceId,
        starts_at: input.startsAt,
        customer_email: "ada@example.com",
        turnstile_token: "cf-token",
      },
      "access-1"
    );
  });

  it("passes required:false through", async () => {
    vi.mocked(requestCode).mockResolvedValue({ required: false });
    expect(await requestEmailCode(SLUG, request)).toEqual({
      ok: true,
      data: { required: false, expiresInSeconds: 0 },
    });
  });

  it("maps a send limit and an outage to calm failures", async () => {
    vi.mocked(requestCode).mockRejectedValueOnce(apiError(429, "Too many"));
    expect(await requestEmailCode(SLUG, request)).toMatchObject({
      ok: false,
      code: "code_limited",
    });
    vi.mocked(requestCode).mockRejectedValueOnce(apiError(503, "down"));
    expect(await requestEmailCode(SLUG, request)).toMatchObject({
      ok: false,
      code: "code_unavailable",
    });
  });

  it("rethrows a non-API fault", async () => {
    vi.mocked(requestCode).mockRejectedValue(new Error("network down"));
    await expect(requestEmailCode(SLUG, request)).rejects.toHaveProperty(
      "message",
      "network down"
    );
  });
});

describe("confirmEmailCode", () => {
  const confirm = {
    code: "123456",
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    email: "ada@example.com",
  };

  it("rejects a malformed code before any call", async () => {
    expect(
      await confirmEmailCode(SLUG, { ...confirm, code: "12ab56" })
    ).toMatchObject({ code: "invalid" });
    expect(confirmCode).not.toHaveBeenCalled();
  });

  it("returns the proof", async () => {
    vi.mocked(confirmCode).mockResolvedValue({
      proof: "proof-1",
      expires_in_seconds: 900,
    });
    expect(await confirmEmailCode(SLUG, confirm)).toEqual({
      ok: true,
      data: { proof: "proof-1", expiresInSeconds: 900 },
    });
    expect(confirmCode).toHaveBeenCalledWith(SLUG, {
      service_id: input.serviceId,
      starts_at: input.startsAt,
      customer_email: "ada@example.com",
      code: "123456",
    });
  });

  it("maps a wrong code and a lockout", async () => {
    vi.mocked(confirmCode).mockRejectedValueOnce(apiError(400, "not right"));
    expect(await confirmEmailCode(SLUG, confirm)).toMatchObject({
      ok: false,
      code: "code_rejected",
    });
    vi.mocked(confirmCode).mockRejectedValueOnce(apiError(429, "locked"));
    expect(await confirmEmailCode(SLUG, confirm)).toMatchObject({
      ok: false,
      code: "code_locked",
    });
  });
});
