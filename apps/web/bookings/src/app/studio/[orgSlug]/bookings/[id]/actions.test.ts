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
}));

import { getSession } from "@/lib/session";
import {
  cancelBooking,
  confirmBooking,
  declineBooking,
  findOrganisation,
  markCompleted,
  markNoShow,
} from "@/lib/studio-api";
import {
  cancelBookingAction,
  completeBookingAction,
  confirmBookingAction,
  declineBookingAction,
  noShowBookingAction,
} from "./actions";

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
    vi.mocked(confirmBooking).mockResolvedValue({} as never);
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
    vi.mocked(markCompleted).mockResolvedValue({} as never);
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
    vi.mocked(declineBooking).mockResolvedValue({} as never);
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

  it("leaves the refund to policy when no choice was offered", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({} as never);
    await cancelBookingAction(SLUG, BOOKING_ID, IDLE, form({ reason: "Ill" }));
    expect(cancelBooking).toHaveBeenCalledWith("tok", ORG_ID, BOOKING_ID, {
      reason: "Ill",
    });
  });

  it("sends refund true when the box is ticked", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({} as never);
    await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Ill", refundChoice: "1", refundDeposit: "on" })
    );
    expect(cancelBooking).toHaveBeenCalledWith("tok", ORG_ID, BOOKING_ID, {
      reason: "Ill",
      refundDeposit: true,
    });
  });

  it("sends refund false when the choice was offered and left unticked", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({} as never);
    await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Late", refundChoice: "1" })
    );
    expect(cancelBooking).toHaveBeenCalledWith("tok", ORG_ID, BOOKING_ID, {
      reason: "Late",
      refundDeposit: false,
    });
  });

  it("ignores an organisation id smuggled into the form", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({} as never);
    await cancelBookingAction(
      SLUG,
      BOOKING_ID,
      IDLE,
      form({ reason: "Ill", organisationId: "other-org" })
    );
    expect(vi.mocked(cancelBooking).mock.calls[0]?.[1]).toBe(ORG_ID);
  });
});
