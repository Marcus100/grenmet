import type { MembershipRole } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, BOOKING_ID, ORG_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/studio-api", () => ({
  cancelBooking: vi.fn(),
  confirmBooking: vi.fn(),
  declineBooking: vi.fn(),
  findOrganisation: vi.fn(),
  markCompleted: vi.fn(),
  markNoShow: vi.fn(),
  recordManualDeposit: vi.fn(),
}));

import { getSession } from "@/lib/session";
import {
  cancelBooking,
  confirmBooking,
  declineBooking,
  findOrganisation,
  markCompleted,
  markNoShow,
  recordManualDeposit,
} from "@/lib/studio-api";
import {
  cancelBookingAction,
  completeBookingAction,
  confirmBookingAction,
  declineBookingAction,
  noShowBookingAction,
  recordDepositAction,
} from "./actions";

const OK = { events: [] } as never;
const SLUG = "sea-salt";
const IDLE = { status: "idle" } as const;

function org(role: MembershipRole) {
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: SLUG,
    role,
  });
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session);
  org("admin");
});

describe("booking actions", () => {
  it("confirms for an admin with the organisation from the server", async () => {
    vi.mocked(confirmBooking).mockResolvedValue(OK);
    const result = await confirmBookingAction(SLUG, BOOKING_ID);
    expect(result).toEqual({ status: "done", message: "Booking confirmed." });
    expect(confirmBooking).toHaveBeenCalledWith("tok", ORG_ID, BOOKING_ID);
    expect(revalidatePath).toHaveBeenCalledWith(`/studio/${SLUG}/agenda`);
    expect(revalidatePath).toHaveBeenCalledWith(
      `/studio/${SLUG}/bookings/${BOOKING_ID}`
    );
  });

  it("lets an owner act too", async () => {
    org("owner");
    vi.mocked(markCompleted).mockResolvedValue(OK);
    expect((await completeBookingAction(SLUG, BOOKING_ID)).status).toBe("done");
  });

  it("refuses a member before any call", async () => {
    org("member");
    const result = await confirmBookingAction(SLUG, BOOKING_ID);
    expect(result).toMatchObject({
      status: "error",
      kind: "forbidden",
      message: "You need admin access to change bookings.",
    });
    expect(confirmBooking).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in and keeps the page", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(confirmBookingAction(SLUG, BOOKING_ID)).rejects.toMatchObject({
      message: expect.stringContaining("NEXT_REDIRECT /signin?returnTo="),
    });
    expect(confirmBooking).not.toHaveBeenCalled();
  });

  it("sends an ended token (401 from the API) to sign in", async () => {
    vi.mocked(markNoShow).mockRejectedValue(apiError(401));
    await expect(noShowBookingAction(SLUG, BOOKING_ID)).rejects.toMatchObject({
      message: expect.stringContaining("NEXT_REDIRECT /signin?returnTo="),
    });
  });

  it("says admin access is needed on a 403 from the API", async () => {
    vi.mocked(confirmBooking).mockRejectedValue(apiError(403));
    const result = await confirmBookingAction(SLUG, BOOKING_ID);
    expect(result).toMatchObject({
      status: "error",
      kind: "forbidden",
      message: "You need admin access to change bookings.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("explains a 409 and refreshes the screens", async () => {
    vi.mocked(confirmBooking).mockRejectedValue(apiError(409));
    const result = await confirmBookingAction(SLUG, BOOKING_ID);
    expect(result).toMatchObject({ status: "error", kind: "conflict" });
    expect(revalidatePath).toHaveBeenCalledWith(
      `/studio/${SLUG}/bookings/${BOOKING_ID}`
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("answers a double submit (the second sees a 409) without reporting it", async () => {
    vi.mocked(markNoShow)
      .mockResolvedValueOnce(OK)
      .mockRejectedValueOnce(apiError(409));
    const first = await noShowBookingAction(SLUG, BOOKING_ID);
    const second = await noShowBookingAction(SLUG, BOOKING_ID);
    expect(first.status).toBe("done");
    expect(second).toMatchObject({ status: "error", kind: "conflict" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure and returns a fallback", async () => {
    const boom = new Error("network down");
    vi.mocked(confirmBooking).mockRejectedValue(boom);
    const result = await confirmBookingAction(SLUG, BOOKING_ID);
    expect(result).toMatchObject({ status: "error", kind: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(boom, "studio");
  });

  it("reports a 5xx from the API", async () => {
    const error = apiError(503);
    vi.mocked(markNoShow).mockRejectedValue(error);
    await noShowBookingAction(SLUG, BOOKING_ID);
    expect(reportError).toHaveBeenCalledWith(error, "studio");
  });

  it("404s an unknown business and a malformed id without calling the API", async () => {
    vi.mocked(findOrganisation).mockResolvedValue(null);
    expect(await confirmBookingAction(SLUG, BOOKING_ID)).toMatchObject({
      kind: "not_found",
    });
    expect(await confirmBookingAction(SLUG, "not-a-uuid")).toMatchObject({
      kind: "not_found",
    });
    expect(await confirmBookingAction("../x", BOOKING_ID)).toMatchObject({
      kind: "not_found",
    });
    expect(confirmBooking).not.toHaveBeenCalled();
  });
});

describe("decline", () => {
  it("sends the trimmed reason", async () => {
    vi.mocked(declineBooking).mockResolvedValue(OK);
    const result = await declineBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "  Fully booked  " })
    );
    expect(result.status).toBe("done");
    expect(declineBooking).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      BOOKING_ID,
      "Fully booked"
    );
  });

  it("needs a reason", async () => {
    const result = await declineBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "   " })
    );
    expect(result).toMatchObject({ status: "error", kind: "invalid" });
    expect(declineBooking).not.toHaveBeenCalled();
  });
});

describe("cancel", () => {
  it("rejects a missing or over-long reason", async () => {
    for (const reason of ["", "x".repeat(301)]) {
      const result = await cancelBookingAction(
        SLUG,
        BOOKING_ID,
        IDLE,
        form({ reason })
      );
      expect(result).toMatchObject({ status: "error", kind: "invalid" });
    }
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it.each([
    ["no choice offered", {}, undefined],
    ["follow the policy", { refundChoice: "policy" }, undefined],
    ["refund", { refundChoice: "refund" }, true],
    ["keep", { refundChoice: "keep" }, false],
  ] as const)("sends refund_deposit for %s", async (_name, fields, sent) => {
    vi.mocked(cancelBooking).mockResolvedValue(OK);
    await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Ill", ...fields })
    );
    expect(cancelBooking).toHaveBeenCalledWith("tok", ORG_ID, BOOKING_ID, {
      reason: "Ill",
      ...(sent === undefined ? {} : { refundDeposit: sent }),
    });
  });

  it("rejects an unknown refund choice", async () => {
    const result = await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Ill", refundChoice: "double" })
    );
    expect(result).toMatchObject({ status: "error", kind: "invalid" });
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it("shows the friendly message when the reason field is missing", async () => {
    const result = await cancelBookingAction(SLUG, BOOKING_ID, IDLE, form({}));
    expect(result).toMatchObject({
      message: "Give a reason; the customer sees it in their email.",
    });
  });

  it("warns when the deposit refund failed", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({
      events: [{ note: "Deposit refund failed; refund it by hand" }],
    } as never);
    const result = await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Ill", refundChoice: "refund" })
    );
    expect(result).toEqual({
      status: "done",
      warning: true,
      message:
        "Booking cancelled. The deposit refund failed; refund it by hand.",
    });
  });

  it("warns on a failed refund after a decline too", async () => {
    vi.mocked(declineBooking).mockResolvedValue({
      events: [{ note: "Deposit refund failed; refund it by hand" }],
    } as never);
    const result = await declineBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Full" })
    );
    expect(result).toMatchObject({ status: "done", warning: true });
  });

  it("does not warn when the refund went through", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({
      events: [{ note: "Deposit refunded" }],
    } as never);
    const result = await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Ill" })
    );
    expect(result).toEqual({ status: "done", message: "Booking cancelled." });
  });

  it("ignores an organisation id smuggled into the form", async () => {
    vi.mocked(cancelBooking).mockResolvedValue(OK);
    await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Ill", organisationId: "other-org" })
    );
    expect(vi.mocked(cancelBooking).mock.calls[0]?.[1]).toBe(ORG_ID);
  });
});

describe("recordDepositAction", () => {
  const KEY = "99999999-9999-4999-8999-999999999999";
  const run = (values: Record<string, string> = {}) =>
    recordDepositAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ method: "cash", reference: "R-1", idempotencyKey: KEY, ...values })
    );

  it("records with the key, the method and the organisation from the server", async () => {
    vi.mocked(recordManualDeposit).mockResolvedValue(OK);
    expect(await run({ amount: "1" })).toEqual({
      status: "done",
      message: "Deposit recorded.",
    });
    expect(recordManualDeposit).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      BOOKING_ID,
      KEY,
      { method: "cash", reference: "R-1" }
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      `/studio/${SLUG}/bookings/${BOOKING_ID}`
    );
  });

  it("refuses a member before any call", async () => {
    org("member");
    expect(await run()).toMatchObject({ status: "error", kind: "forbidden" });
    expect(recordManualDeposit).not.toHaveBeenCalled();
  });

  it("rejects an unknown method and a bad key before any call", async () => {
    expect(await run({ method: "bitcoin" })).toMatchObject({
      status: "error",
      kind: "invalid",
    });
    expect(await run({ idempotencyKey: "nope" })).toMatchObject({
      status: "error",
      kind: "invalid",
    });
    expect(recordManualDeposit).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(run()).rejects.toMatchObject({
      message: expect.stringContaining("NEXT_REDIRECT /signin?returnTo="),
    });
  });

  it.each([
    ["no deposit to record", "no deposit"],
    ["A closed booking cannot take a deposit", "closed"],
    ["The deposit has already been paid", "already been paid"],
    [
      "The deposit is being paid online; that payment must expire or fail first",
      "card payment is still open",
    ],
    [
      "The card payment for this deposit has failed or expired, so it cannot",
      "book again",
    ],
  ])("explains the 409 %s", async (detail, expected) => {
    vi.mocked(recordManualDeposit).mockRejectedValue(apiError(409, { detail }));
    const result = await run();
    expect(result).toMatchObject({ status: "error", kind: "conflict" });
    expect(JSON.stringify(result)).toContain(expected);
    expect(revalidatePath).toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("does not refresh for an idempotency 409", async () => {
    vi.mocked(recordManualDeposit).mockRejectedValue(
      apiError(409, { detail: "Idempotency key reused with another body" })
    );
    await run();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("names the payments entitlement on a 403 about it", async () => {
    vi.mocked(recordManualDeposit).mockRejectedValue(
      apiError(403, { detail: "Missing entitlement: payments" })
    );
    expect(await run()).toMatchObject({
      kind: "forbidden",
      message: expect.stringContaining("not included"),
    });
  });

  it("reports a server fault as unavailable", async () => {
    vi.mocked(recordManualDeposit).mockRejectedValue(apiError(503));
    expect(await run()).toMatchObject({ kind: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(expect.anything(), "studio");
  });
});
