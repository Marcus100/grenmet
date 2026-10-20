import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBooking, getAvailability } from "@/lib/booking-api";
import { type BookingInput, loadSlots, submitBooking } from "./actions";

const mocks = vi.hoisted(() => ({
  env: { BABYDOLL_ONLINE_BOOKING: "on" as "on" | "off" },
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/lib/booking-api", () => ({
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
}));

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
  mocks.env.BABYDOLL_ONLINE_BOOKING = "on";
});

describe("submitBooking", () => {
  it("is refused while online booking is off", async () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "off";
    expect(await submitBooking(input)).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("sends the trimmed request with the idempotency key and no empty extras", async () => {
    vi.mocked(createBooking).mockResolvedValue({
      booking: {} as never,
      manage_token: "tok",
      manage_url: null,
    });
    const outcome = await submitBooking(input);

    expect(outcome.ok).toBe(true);
    expect(createBooking).toHaveBeenCalledWith(
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

  it("passes a filled honeypot through so the API can drop it", async () => {
    vi.mocked(createBooking).mockResolvedValue({
      booking: {} as never,
      manage_token: "tok",
      manage_url: null,
    });
    await submitBooking({ ...input, website: "http://spam.example" });
    expect(vi.mocked(createBooking).mock.calls[0]?.[0]).toMatchObject({
      website: "http://spam.example",
    });
  });

  it("rejects a bad email or key before calling the API", async () => {
    expect(await submitBooking({ ...input, email: "nope" })).toMatchObject({
      code: "invalid",
    });
    expect(
      await submitBooking({ ...input, idempotencyKey: "short" })
    ).toMatchObject({ code: "invalid" });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("maps a taken slot and rethrows a network fault", async () => {
    vi.mocked(createBooking).mockRejectedValueOnce(
      apiError(409, "That time is no longer available. Please choose another.")
    );
    expect(await submitBooking(input)).toMatchObject({
      ok: false,
      code: "slot_taken",
    });

    vi.mocked(createBooking).mockRejectedValueOnce(
      new TypeError("fetch failed")
    );
    const fault = await submitBooking(input).then(
      () => null,
      (error: unknown) => error
    );
    expect(fault).toHaveProperty("message", "fetch failed");
  });
});

describe("loadSlots", () => {
  it("returns only what the picker needs", async () => {
    vi.mocked(getAvailability).mockResolvedValue({
      timezone: "America/Grenada",
      service_id: input.serviceId,
      slots: [
        {
          starts_at: input.startsAt,
          ends_at: "2027-01-05T15:45:00Z",
          provider_ids: ["p1"],
        },
      ],
    });
    expect(await loadSlots(input.serviceId, "2027-01-04")).toEqual({
      ok: true,
      data: {
        timezone: "America/Grenada",
        slots: [{ starts_at: input.startsAt, ends_at: "2027-01-05T15:45:00Z" }],
      },
    });
  });

  it("rejects malformed arguments", async () => {
    expect(await loadSlots("x", "2027-01-04")).toMatchObject({
      code: "invalid",
    });
    expect(await loadSlots(input.serviceId, "tomorrow")).toMatchObject({
      code: "invalid",
    });
  });
});
