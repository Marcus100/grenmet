import { describe, expect, it } from "vitest";
import type { RefundTerms } from "@/domain/types";
import {
  CANCELLED_EVENT_LINE,
  clampCutoffHours,
  deadlineFromHours,
  deadlineHours,
  formatHours,
  refundSummary,
  refundTermsLines,
  ticketRefundTerms,
} from "./refund-terms";

const BASE: RefundTerms = {
  policy: "refundable",
  cutoffHours: null,
  cutoffHoursEffective: 48,
  feeType: "none",
  feeValue: 0,
};

const terms = (overrides: Partial<RefundTerms>): RefundTerms => ({
  ...BASE,
  ...overrides,
});

describe("refundSummary", () => {
  it("says full refunds until the default two days", () => {
    expect(refundSummary(BASE)).toBe(
      "Ask the organiser for a full refund until 2 days before the event."
    );
  });

  it("names a fixed fee per ticket in EC$", () => {
    expect(refundSummary(terms({ feeType: "fixed", feeValue: 500 }))).toBe(
      "Ask the organiser for a refund until 2 days before the event, less EC$5.00 per ticket."
    );
  });

  it("names a percentage fee", () => {
    expect(
      refundSummary(
        terms({ cutoffHoursEffective: 168, feeType: "percent", feeValue: 10 })
      )
    ).toBe(
      "Ask the organiser for a refund until 7 days before the event, less 10% of the amount paid."
    );
  });

  it("treats a zero fee as no fee", () => {
    expect(refundSummary(terms({ feeType: "fixed", feeValue: 0 }))).toBe(
      "Ask the organiser for a full refund until 2 days before the event."
    );
  });

  it("says no refunds, except a cancelled event", () => {
    expect(refundSummary(terms({ policy: "no_refunds" }))).toBe(
      "No refunds, except if the event is cancelled."
    );
  });

  it("reads a zero cutoff as until the event starts", () => {
    expect(refundSummary(terms({ cutoffHoursEffective: 0 }))).toBe(
      "Ask the organiser for a full refund until the event starts."
    );
  });

  it("uses hours for a cutoff that is not whole days", () => {
    expect(refundSummary(terms({ cutoffHoursEffective: 36 }))).toBe(
      "Ask the organiser for a full refund until 36 hours before the event."
    );
  });
});

describe("refundSummary for the organiser", () => {
  it("states the terms as the organiser's own rule", () => {
    expect(refundSummary(BASE, "organiser")).toBe(
      "Full refunds until 2 days before the event."
    );
  });
});

describe("refundTermsLines", () => {
  it("adds the full refund for an organiser cancellation to every terms", () => {
    expect(refundTermsLines(terms({ policy: "no_refunds" }))).toEqual({
      summary: "No refunds, except if the event is cancelled.",
      cancelled: "If the organiser cancels the event, you get a full refund.",
    });
    expect(CANCELLED_EVENT_LINE).toBe(
      "If the organiser cancels the event, you get a full refund."
    );
  });
});

describe("formatHours", () => {
  it("reads whole days, singular and plural", () => {
    expect(formatHours(24)).toBe("1 day");
    expect(formatHours(720)).toBe("30 days");
  });

  it("reads other hours and the singular hour", () => {
    expect(formatHours(1)).toBe("1 hour");
    expect(formatHours(5)).toBe("5 hours");
  });
});

describe("deadline controls", () => {
  it("saves the two-day preset as the platform default (null)", () => {
    expect(deadlineHours("2d", 999)).toBeNull();
    expect(deadlineHours("1d", 999)).toBe(24);
    expect(deadlineHours("7d", 999)).toBe(168);
    expect(deadlineHours("30d", 999)).toBe(720);
  });

  it("uses the typed hours for a custom deadline, clamped to 0 to 720", () => {
    expect(deadlineHours("custom", 36)).toBe(36);
    expect(deadlineHours("custom", -4)).toBe(0);
    expect(deadlineHours("custom", 9999)).toBe(720);
  });

  it("maps a saved cutoff back to its preset or to custom", () => {
    expect(deadlineFromHours(null)).toEqual({
      deadline: "2d",
      customHours: 72,
    });
    expect(deadlineFromHours(48)).toEqual({ deadline: "2d", customHours: 48 });
    expect(deadlineFromHours(168)).toEqual({
      deadline: "7d",
      customHours: 168,
    });
    expect(deadlineFromHours(36)).toEqual({
      deadline: "custom",
      customHours: 36,
    });
  });

  it("rounds and clamps typed hours", () => {
    expect(clampCutoffHours(12.6)).toBe(13);
    expect(clampCutoffHours(Number.NaN)).toBe(0);
  });
});

describe("ticketRefundTerms", () => {
  const tierOf = (name: string, amountMinor: number) => ({
    id: name,
    name,
    allocation: 10,
    held: 0,
    perAccountLimit: 4,
    remaining: 10,
    price: { amountMinor, currency: "XCD" as const },
  });
  const paidEvent = {
    refundTerms: BASE,
    tiers: [tierOf("General", 0), tierOf("VIP", 5000)],
  };

  it("gives the terms for a ticket from a paid tier", () => {
    expect(ticketRefundTerms(paidEvent, "VIP")).toBe(BASE);
  });

  it("gives no terms for a free or RSVP ticket", () => {
    expect(ticketRefundTerms(paidEvent, "General")).toBeNull();
    expect(ticketRefundTerms(paidEvent, "Not a tier")).toBeNull();
  });

  it("gives no terms when the event is unknown", () => {
    expect(ticketRefundTerms(null, "VIP")).toBeNull();
  });
});
