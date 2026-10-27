import { ResponseError } from "@barrelsgd/api-client";
import type { BookingInput } from "@barrelsgd/bookings-web/lib/booking-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmEmailCode as confirmCode,
  createBooking,
  getAvailability,
  requestEmailCode as requestCode,
} from "@/lib/booking-api";
import {
  confirmEmailCode,
  loadSlots,
  requestEmailCode,
  submitBooking,
} from "./actions";

const mocks = vi.hoisted(() => ({
  env: { BABYDOLL_ONLINE_BOOKING: "on" as "on" | "off" },
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/lib/booking-api", () => ({
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
  requestEmailCode: vi.fn(),
  confirmEmailCode: vi.fn(),
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

describe("requestEmailCode", () => {
  const request = {
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    email: " ada@example.com ",
    turnstileToken: " cf-token ",
  };

  it("is refused while online booking is off", async () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "off";
    expect(await requestEmailCode(request)).toMatchObject({
      code: "not_found",
    });
    expect(requestCode).not.toHaveBeenCalled();
  });

  it("rejects a bad email before any call", async () => {
    expect(await requestEmailCode({ ...request, email: "nope" })).toMatchObject(
      { code: "invalid" }
    );
    expect(requestCode).not.toHaveBeenCalled();
  });

  it("sends the trimmed request with the Turnstile token", async () => {
    vi.mocked(requestCode).mockResolvedValue({
      required: true,
      expires_in_seconds: 600,
    });
    expect(await requestEmailCode(request)).toEqual({
      ok: true,
      data: { required: true, expiresInSeconds: 600 },
    });
    expect(requestCode).toHaveBeenCalledWith({
      service_id: input.serviceId,
      starts_at: input.startsAt,
      customer_email: "ada@example.com",
      turnstile_token: "cf-token",
    });
  });

  it("passes required:false through", async () => {
    vi.mocked(requestCode).mockResolvedValue({ required: false });
    expect(await requestEmailCode(request)).toEqual({
      ok: true,
      data: { required: false, expiresInSeconds: 0 },
    });
  });

  it("maps a send limit and an outage, and rethrows a non-API fault", async () => {
    vi.mocked(requestCode).mockRejectedValueOnce(apiError(429, "Too many"));
    expect(await requestEmailCode(request)).toMatchObject({
      code: "code_limited",
    });
    vi.mocked(requestCode).mockRejectedValueOnce(apiError(503, "down"));
    expect(await requestEmailCode(request)).toMatchObject({
      code: "code_unavailable",
    });
    vi.mocked(requestCode).mockRejectedValueOnce(new Error("network down"));
    await expect(requestEmailCode(request)).rejects.toHaveProperty(
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
      await confirmEmailCode({ ...confirm, code: "12ab56" })
    ).toMatchObject({ code: "invalid" });
    expect(confirmCode).not.toHaveBeenCalled();
  });

  it("returns the proof", async () => {
    vi.mocked(confirmCode).mockResolvedValue({
      proof: "proof-1",
      expires_in_seconds: 900,
    });
    expect(await confirmEmailCode(confirm)).toEqual({
      ok: true,
      data: { proof: "proof-1", expiresInSeconds: 900 },
    });
  });

  it("maps a wrong code and a lockout", async () => {
    vi.mocked(confirmCode).mockRejectedValueOnce(apiError(400, "not right"));
    expect(await confirmEmailCode(confirm)).toMatchObject({
      code: "code_rejected",
    });
    vi.mocked(confirmCode).mockRejectedValueOnce(apiError(429, "locked"));
    expect(await confirmEmailCode(confirm)).toMatchObject({
      code: "code_locked",
    });
  });
});

describe("submitBooking email proof", () => {
  it("sends the proof to the API untouched", async () => {
    vi.mocked(createBooking).mockResolvedValue({
      booking: {} as never,
      manage_token: "tok",
      manage_url: null,
    });
    await submitBooking({ ...input, emailProof: "proof-1" });
    expect(vi.mocked(createBooking).mock.calls[0]?.[0]).toMatchObject({
      email_proof: "proof-1",
    });
    expect(vi.mocked(createBooking).mock.calls[0]?.[1]).toBe(
      input.idempotencyKey
    );
  });
});

describe("untyped browser input", () => {
  // Server Action arguments are whatever the client sends, not their TS types.
  const bad = {
    ...input,
    email: 42,
    code: {},
    turnstileToken: ["x"],
    phone: null,
  } as never;

  it("answers a non-string field with the normal validation failure", async () => {
    await expect(submitBooking(bad)).resolves.toMatchObject({
      code: "invalid",
    });
    await expect(requestEmailCode(bad)).resolves.toMatchObject({
      code: "invalid",
    });
    await expect(confirmEmailCode(bad)).resolves.toMatchObject({
      code: "invalid",
    });
    await expect(submitBooking(null as never)).resolves.toMatchObject({
      code: "invalid",
    });
  });
});
