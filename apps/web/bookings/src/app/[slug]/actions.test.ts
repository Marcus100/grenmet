import { ResponseError } from "@barrelsgd/api-client";
import type { BookingInput } from "@barrelsgd/bookings-web/lib/booking-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBooking, getAvailability } from "@/lib/booking-api";
import { loadSlots, submitBooking } from "./actions";

vi.mock("@/lib/booking-api", () => ({
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
}));

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
      input.idempotencyKey
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
      input.idempotencyKey
    );
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
