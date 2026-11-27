import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  businessTakesDeposit,
  type PolicyService,
  suggestedPolicy,
} from "./suggested-policy";

function profile(overrides: Partial<BookingProfilePublic> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "org-1",
    public_slug: "salon",
    display_name: "Salon",
    ...overrides,
  } as BookingProfilePublic;
}

function service(overrides: Partial<PolicyService> = {}): PolicyService {
  return { active: true, deposit_minor: 0, ...overrides };
}

describe("businessTakesDeposit", () => {
  it("is false with no rule, no card price and no service deposit", () => {
    expect(businessTakesDeposit(profile(), [service()])).toBe(false);
    expect(businessTakesDeposit(profile(), [])).toBe(false);
  });

  it("is true for a business-wide rule, the full price, or a service's own deposit", () => {
    expect(businessTakesDeposit(profile({ deposit_mode: "percent" }), [])).toBe(
      true
    );
    expect(businessTakesDeposit(profile({ deposit_mode: "fixed" }), [])).toBe(
      true
    );
    expect(
      businessTakesDeposit(profile({ payment_at_booking: "full_price" }), [])
    ).toBe(true);
    expect(
      businessTakesDeposit(profile(), [service({ deposit_minor: 2500 })])
    ).toBe(true);
  });

  it("ignores a switched-off service's deposit", () => {
    expect(
      businessTakesDeposit(profile(), [
        service({ active: false, deposit_minor: 2500 }),
      ])
    ).toBe(false);
  });
});

describe("suggestedPolicy", () => {
  const suggest = (
    overrides: Partial<BookingProfilePublic> = {},
    takesDeposit = false
  ) =>
    suggestedPolicy({
      currency: "XCD",
      profile: profile(overrides),
      takesDeposit,
    });

  it("leaves the deposit out when the business takes none", () => {
    const text = suggest();
    expect(text).not.toContain("Deposit:");
    expect(text).toContain("Changes and cancellations:");
    expect(text).toContain("Arriving late:");
  });

  it("uses the business's own cancellation cutoff, in both paragraphs", () => {
    const text = suggest({ cancel_cutoff_hours: 48 }, true);
    expect(text).toContain(
      "please change or cancel at least 48 hours before your appointment"
    );
    expect(text).toContain("Inside 48 hours that link is closed");
    expect(text).toContain(
      "If you cancel more than 48 hours before your appointment, the deposit is refunded."
    );
  });

  it("falls back to the API's own default cutoff of 24 hours", () => {
    expect(suggest()).toContain("at least 24 hours before your appointment");
  });

  it("says one hour in the singular", () => {
    expect(suggest({ cancel_cutoff_hours: 1 })).toContain(
      "at least 1 hour before your appointment"
    );
  });

  it("drops the cutoff wording when there is no cutoff at all", () => {
    const text = suggest({ cancel_cutoff_hours: 0 }, true);
    expect(text).toContain("at any time before it starts");
    expect(text).toContain(
      "If you cancel before your appointment, the deposit is refunded."
    );
    expect(text).not.toContain("0 hours");
  });

  it("says the deposit is not refunded when the business keeps it", () => {
    const text = suggest({ deposit_non_refundable: true }, true);
    expect(text).toContain("The deposit is not refunded if you cancel.");
    expect(text).not.toContain("the deposit is refunded");
  });

  it("says the deposit is paid to the business when it collects it itself", () => {
    const text = suggest({ deposit_collection: "business" }, true);
    expect(text).toContain("You pay the deposit to us directly");
    expect(text).toContain("once it reaches us");
  });

  it("says the deposit is taken at booking in the online mode", () => {
    const text = suggest({ deposit_collection: "online" }, true);
    expect(text).toContain("The deposit is paid when you book");
  });

  it("uses the business's own late fee and grace period, in its currency", () => {
    const text = suggest({ late_fee_minor: 2000, late_grace_min: 15 });
    expect(text).toContain(
      "Arriving late: Arriving more than 15 minutes late adds a late fee of EC$20."
    );
  });

  it("words lateness without a fee when the business set none", () => {
    const text = suggest();
    expect(text).toContain("Arriving late: please arrive on time.");
    expect(text).not.toContain("late fee of");
  });

  it("is paragraphs separated by a blank line, and fits the policy box", () => {
    const text = suggest({ late_fee_minor: 2000 }, true);
    expect(text.split("\n\n")).toHaveLength(3);
    expect(text.startsWith("Deposit:")).toBe(true);
    expect([...text].length).toBeLessThanOrEqual(1000);
    expect(text.trim()).toBe(text);
  });
});
