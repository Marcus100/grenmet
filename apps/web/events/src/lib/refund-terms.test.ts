import { describe, expect, it } from "vitest";
import type { RefundTerms } from "@/domain/types";
import {
  buyerCancelMayKeepMoney,
  CANCELLED_EVENT_LINE,
  clampCutoffHours,
  deadlineFromHours,
  deadlineHours,
  formatHours,
  refundSummary,
  refundTermsLines,
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
      "Full refunds until 2 days before the event."
    );
  });

  it("names a fixed fee per ticket in EC$", () => {
    expect(refundSummary(terms({ feeType: "fixed", feeValue: 500 }))).toBe(
      "Refunds until 2 days before the event, less EC$5.00 per ticket."
    );
  });

  it("names a percentage fee", () => {
    expect(
      refundSummary(
        terms({ cutoffHoursEffective: 168, feeType: "percent", feeValue: 10 })
      )
    ).toBe(
      "Refunds until 7 days before the event, less 10% of the amount paid."
    );
  });

  it("treats a zero fee as no fee", () => {
    expect(refundSummary(terms({ feeType: "fixed", feeValue: 0 }))).toBe(
      "Full refunds until 2 days before the event."
    );
  });

  it("says no refunds, except a cancelled event", () => {
    expect(refundSummary(terms({ policy: "no_refunds" }))).toBe(
      "No refunds, except if the event is cancelled."
    );
  });

  it("reads a zero cutoff as until the event starts", () => {
    expect(refundSummary(terms({ cutoffHoursEffective: 0 }))).toBe(
      "Full refunds until the event starts."
    );
  });

  it("uses hours for a cutoff that is not whole days", () => {
    expect(refundSummary(terms({ cutoffHoursEffective: 36 }))).toBe(
      "Full refunds until 36 hours before the event."
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

describe("buyerCancelMayKeepMoney", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const sixDaysAhead = "2026-11-27T12:00:00Z";
  const tomorrow = "2026-11-22T12:00:00Z";

  it("is true for no refunds, whenever the event starts", () => {
    expect(
      buyerCancelMayKeepMoney(
        terms({ policy: "no_refunds" }),
        sixDaysAhead,
        now
      )
    ).toBe(true);
  });

  it("is true for any fee", () => {
    expect(
      buyerCancelMayKeepMoney(
        terms({ feeType: "percent", feeValue: 5 }),
        sixDaysAhead,
        now
      )
    ).toBe(true);
  });

  it("is true inside the cutoff and false outside it", () => {
    // BASE has a 48 hour cutoff: tomorrow is inside it, six days ahead is not.
    expect(buyerCancelMayKeepMoney(BASE, tomorrow, now)).toBe(true);
    expect(buyerCancelMayKeepMoney(BASE, sixDaysAhead, now)).toBe(false);
    expect(
      buyerCancelMayKeepMoney(
        terms({ cutoffHoursEffective: 168 }),
        sixDaysAhead,
        now
      )
    ).toBe(true);
  });
});
