import type { AppSubscriptionPublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  bookingsSubscription,
  checkoutAction,
  checkoutReturn,
  checkoutReturnCopy,
  formatPlanDay,
  isStripeCheckoutUrl,
  planCopy,
  planPriceLabel,
  planState,
  planUsdNote,
} from "@/lib/billing-plan";

const NOW = new Date("2026-11-23T12:00:00Z");
const CONFIRMS = /once Stripe confirms/u;
const NOTHING_CHARGED = /Nothing was charged/u;

function row(
  overrides: Partial<AppSubscriptionPublic> = {}
): AppSubscriptionPublic {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    app_key: "bookings",
    plan_key: "bookings-monthly",
    channel: "stripe",
    status: "active",
    currency: "XCD",
    amount_minor: 3000,
    current_period_end: "2026-12-23T12:00:00Z",
    cancel_at_period_end: false,
    trial_end: null,
    created_at: "2026-11-22T10:00:00Z",
    ...overrides,
  };
}

describe("plan price copy", () => {
  it("states the price in XCD, whole dollars without cents", () => {
    expect(planPriceLabel()).toBe("XCD 30 a month");
    expect(planPriceLabel(3050)).toBe("XCD 30.50 a month");
  });

  it("gives the USD figure as a converted note at the 2.70 peg", () => {
    expect(planUsdNote()).toBe(
      "about USD 11.11 a month, for reference. You pay in XCD."
    );
  });

  it("formats a day on the business calendar", () => {
    expect(formatPlanDay("2026-12-23T12:00:00Z")).toBe("23 December 2026");
  });
});

describe("planState", () => {
  it("is none when there is no Bookings row", () => {
    expect(planState(undefined, NOW)).toEqual({ kind: "none" });
  });

  it("is pending while the checkout is open (incomplete)", () => {
    expect(planState(row({ status: "incomplete" }), NOW)).toEqual({
      kind: "pending",
    });
  });

  it("is a free month while a trial end is still ahead", () => {
    expect(planState(row({ trial_end: "2026-12-23T12:00:00Z" }), NOW)).toEqual({
      kind: "trial",
      endsOn: "2026-12-23T12:00:00Z",
    });
  });

  it("is active once the trial end has passed", () => {
    expect(planState(row({ trial_end: "2026-11-01T12:00:00Z" }), NOW)).toEqual({
      kind: "active",
      renewsOn: "2026-12-23T12:00:00Z",
    });
  });

  it("is active with a renewal day when there is no trial", () => {
    expect(planState(row(), NOW)).toEqual({
      kind: "active",
      renewsOn: "2026-12-23T12:00:00Z",
    });
  });

  it("is ending when active but set not to renew", () => {
    expect(planState(row({ cancel_at_period_end: true }), NOW)).toEqual({
      kind: "ending",
      endsOn: "2026-12-23T12:00:00Z",
    });
  });

  it("is payment overdue for past_due", () => {
    expect(planState(row({ status: "past_due" }), NOW)).toEqual({
      kind: "past_due",
    });
  });

  it("is unpaid for unpaid", () => {
    expect(planState(row({ status: "unpaid" }), NOW)).toEqual({
      kind: "unpaid",
    });
  });

  it("is cancelled for canceled", () => {
    expect(planState(row({ status: "canceled" }), NOW)).toEqual({
      kind: "cancelled",
    });
  });

  it("reads an unknown status as no subscription, not as a claim", () => {
    const unknown = row({
      status: "paused" as AppSubscriptionPublic["status"],
    });
    expect(planState(unknown, NOW)).toEqual({ kind: "none" });
  });
});

describe("planCopy", () => {
  it("says 'No subscription yet' rather than hiding the section", () => {
    expect(planCopy({ kind: "none" }).heading).toBe("No subscription yet");
  });

  it("gives every state a heading and a plain detail", () => {
    const states = [
      { kind: "none" },
      { kind: "pending" },
      { kind: "trial", endsOn: "2026-12-23T12:00:00Z" },
      { kind: "active", renewsOn: "2026-12-23T12:00:00Z" },
      { kind: "active", renewsOn: null },
      { kind: "ending", endsOn: "2026-12-23T12:00:00Z" },
      { kind: "past_due" },
      { kind: "unpaid" },
      { kind: "cancelled" },
    ] as const;
    for (const state of states) {
      const copy = planCopy(state);
      expect(copy.heading.length).toBeGreaterThan(0);
      expect(copy.detail.length).toBeGreaterThan(0);
    }
  });

  it("names the free month end date and the price after it", () => {
    expect(
      planCopy({ kind: "trial", endsOn: "2026-12-23T12:00:00Z" }).detail
    ).toBe(
      "Your free month ends on 23 December 2026. After that the plan costs XCD 30 a month."
    );
  });

  it("names the day an ending plan stops", () => {
    expect(
      planCopy({ kind: "ending", endsOn: "2026-12-23T12:00:00Z" }).detail
    ).toBe("Active until 23 December 2026. It will not renew after that.");
  });
});

describe("checkoutAction", () => {
  it("offers Start subscription with none or cancelled", () => {
    expect(checkoutAction({ kind: "none" })).toEqual({
      label: "Start subscription",
    });
    expect(checkoutAction({ kind: "cancelled" })).toEqual({
      label: "Start subscription",
    });
  });

  it("offers Continue checkout while a session is pending", () => {
    expect(checkoutAction({ kind: "pending" })).toEqual({
      label: "Continue checkout",
    });
  });

  it("offers nothing for a live or overdue plan", () => {
    expect(checkoutAction({ kind: "active", renewsOn: null })).toBeNull();
    expect(checkoutAction({ kind: "past_due" })).toBeNull();
    expect(checkoutAction({ kind: "trial", endsOn: "x" })).toBeNull();
  });
});

describe("checkout return", () => {
  it("reads success and cancelled only", () => {
    expect(checkoutReturn("success")).toBe("success");
    expect(checkoutReturn("cancelled")).toBe("cancelled");
    expect(checkoutReturn("paid")).toBeNull();
    expect(checkoutReturn(undefined)).toBeNull();
  });

  it("says success is not yet a confirmed plan, and cancel charged nothing", () => {
    expect(checkoutReturnCopy("success")).toMatch(CONFIRMS);
    expect(checkoutReturnCopy("cancelled")).toMatch(NOTHING_CHARGED);
  });
});

describe("bookingsSubscription", () => {
  it("takes the newest Bookings row and ignores other apps", () => {
    const other = row({ app_key: "events", status: "active" });
    const newest = row({ status: "incomplete" });
    const older = row({ status: "canceled" });
    expect(bookingsSubscription([other, newest, older])).toBe(newest);
    expect(bookingsSubscription([other])).toBeUndefined();
  });
});

describe("isStripeCheckoutUrl", () => {
  it("accepts Stripe's hosted checkout over HTTPS", () => {
    expect(
      isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_123")
    ).toBe(true);
  });

  it("refuses other hosts, plain HTTP and text that is not a URL", () => {
    expect(isStripeCheckoutUrl("https://evil.example/pay")).toBe(false);
    expect(isStripeCheckoutUrl("http://checkout.stripe.com/c/pay")).toBe(false);
    expect(isStripeCheckoutUrl("javascript:alert(1)")).toBe(false);
    expect(isStripeCheckoutUrl("not a url")).toBe(false);
  });
});
