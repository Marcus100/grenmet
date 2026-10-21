import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelBooking,
  getAvailability,
  getBooking,
  rescheduleBooking,
} from "@/lib/booking-api";
import {
  cancelMyBooking,
  loadRescheduleSlots,
  rescheduleMyBooking,
} from "./actions";

vi.mock("@/lib/booking-api", () => ({
  cancelBooking: vi.fn(),
  getAvailability: vi.fn(),
  getBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
}));

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

describe("loadRescheduleSlots", () => {
  it("uses the booking's own service and provider, not the browser's", async () => {
    vi.mocked(getBooking).mockResolvedValue({
      service_id: "svc",
      provider_id: "prov",
    } as never);
    vi.mocked(getAvailability).mockResolvedValue({
      timezone: "America/Grenada",
      slots: [],
    } as never);
    const outcome = await loadRescheduleSlots(
      "sea-salt-spa",
      "tok",
      "2027-01-05"
    );
    expect(getAvailability).toHaveBeenCalledWith(
      "sea-salt-spa",
      "svc",
      "2027-01-05",
      "prov"
    );
    expect(outcome).toEqual({
      ok: true,
      data: { timezone: "America/Grenada", slots: [] },
    });
  });

  it("says the link expired for an unknown token", async () => {
    vi.mocked(getBooking).mockResolvedValue(null);
    expect(
      await loadRescheduleSlots("sea-salt-spa", "tok", "2027-01-05")
    ).toMatchObject({ ok: false, code: "not_found" });
  });

  it("rejects a bad day or slug", async () => {
    expect(
      await loadRescheduleSlots("sea-salt-spa", "tok", "tomorrow")
    ).toMatchObject({ ok: false, code: "invalid" });
    expect(
      await loadRescheduleSlots("Bad Slug", "tok", "2027-01-05")
    ).toMatchObject({ ok: false, code: "invalid" });
    expect(getBooking).not.toHaveBeenCalled();
  });
});

describe("cancelMyBooking", () => {
  it("returns the cancelled booking", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({
      status: "cancelled",
    } as never);
    expect(await cancelMyBooking("tok")).toEqual({
      ok: true,
      data: { status: "cancelled" },
    });
    expect(cancelBooking).toHaveBeenCalledWith("tok");
  });

  it("maps an API refusal to a failure", async () => {
    vi.mocked(cancelBooking).mockRejectedValue(
      apiError(409, "Too late to cancel online")
    );
    expect(await cancelMyBooking("tok")).toMatchObject({ ok: false });
  });
});

describe("rescheduleMyBooking", () => {
  it("rejects a non-UTC instant", async () => {
    expect(await rescheduleMyBooking("tok", "next tuesday")).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(rescheduleBooking).not.toHaveBeenCalled();
  });

  it("reschedules to the chosen instant", async () => {
    vi.mocked(rescheduleBooking).mockResolvedValue({
      status: "pending",
    } as never);
    const outcome = await rescheduleMyBooking("tok", "2027-01-06T13:30:00Z");
    expect(rescheduleBooking).toHaveBeenCalledWith(
      "tok",
      "2027-01-06T13:30:00Z"
    );
    expect(outcome.ok).toBe(true);
  });
});
