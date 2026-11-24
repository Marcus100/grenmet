import type { BookingPaymentSummary } from "@barrelsgd/api-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  paymentLine,
  paymentReceivedHeld,
  payNowLine,
  recallManagePath,
  rememberManagePath,
  safeCheckoutUrl,
} from "./booking-payment";

const due: BookingPaymentSummary = {
  status: "due",
  amount_minor: 21_000,
  paid_minor: 0,
  refunded_minor: 0,
  balance_at_salon_minor: 0,
  currency: "XCD",
  checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
};

describe("paymentLine", () => {
  it("says what is due, paid, refunded or not paid", () => {
    expect(paymentLine(due)).toBe(
      "Payment of EC$210 not received yet. Your time is held until it arrives."
    );
    const paid = { ...due, status: "paid" as const, paid_minor: 21_000 };
    expect(paymentLine(paid)).toBe("Paid EC$210. Thank you.");
    expect(paymentLine({ ...paid, refunded_minor: 5000 })).toBe(
      "Paid EC$210; EC$50 refunded."
    );
    expect(
      paymentLine({ ...paid, status: "refunded", refunded_minor: 21_000 })
    ).toBe("Your payment of EC$210 was refunded.");
    expect(paymentLine({ ...due, status: "unpaid" })).toBe(
      "The payment of EC$210 was not made."
    );
  });
});

describe("safeCheckoutUrl", () => {
  it("returns an https checkout only while the payment is due", () => {
    expect(safeCheckoutUrl(due)).toBe(due.checkout_url);
    expect(safeCheckoutUrl({ ...due, status: "paid" })).toBeNull();
    expect(safeCheckoutUrl({ ...due, checkout_url: null })).toBeNull();
    expect(
      safeCheckoutUrl({ ...due, checkout_url: "javascript:alert(1)" })
    ).toBeNull();
    expect(safeCheckoutUrl({ ...due, checkout_url: "not a url" })).toBeNull();
    expect(safeCheckoutUrl(null)).toBeNull();
  });
});

describe("remember and recall the manage page", () => {
  afterEach(() => window.sessionStorage.clear());

  it("returns a same-site path saved in this tab", () => {
    rememberManagePath("b-1", "/salon/booking/token123");
    expect(recallManagePath("b-1")).toBe("/salon/booking/token123");
    expect(recallManagePath("b-2")).toBeNull();
  });

  it("refuses anything that could leave the site", () => {
    for (const path of [
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example",
    ]) {
      rememberManagePath("b-1", path);
      expect(recallManagePath("b-1")).toBeNull();
    }
  });
});

describe("payNowLine", () => {
  it("says deposit, full price or nothing", () => {
    expect(payNowLine(0, 15_000, "XCD")).toBeNull();
    expect(payNowLine(5000, 15_000, "XCD")).toContain("deposit of EC$50");
    expect(payNowLine(15_000, 15_000, "XCD")).toContain("full price, EC$150");
  });
});

describe("paymentReceivedHeld", () => {
  it("is true only for a held booking that already has money", () => {
    const paid = { ...due, status: "paid" as const, paid_minor: 21_000 };
    expect(paymentReceivedHeld("pending_payment", paid)).toBe(true);
    expect(paymentReceivedHeld("pending_payment", due)).toBe(false);
    expect(paymentReceivedHeld("confirmed", paid)).toBe(false);
    expect(paymentReceivedHeld("pending_payment", null)).toBe(false);
  });
});

describe("deposit wording on the manage page", () => {
  const deposit = {
    status: "paid" as const,
    amount_minor: 15_000,
    paid_minor: 6000,
    refunded_minor: 0,
    balance_at_salon_minor: 15_000,
    currency: "XCD",
    checkout_url: null,
  };

  it("states the balance only once the deposit is paid", () => {
    expect(paymentLine(deposit)).toBe(
      "Deposit paid EC$60, remaining EC$150 at the salon."
    );
  });

  it("does not state a balance while the payment is still due", () => {
    expect(paymentLine({ ...due, balance_at_salon_minor: 15_000 })).toBe(
      "Payment of EC$210 not received yet. Your time is held until it arrives."
    );
  });

  it("keeps the existing wording when nothing is left to pay", () => {
    expect(paymentLine({ ...deposit, balance_at_salon_minor: 0 })).toBe(
      "Paid EC$60. Thank you."
    );
  });
});

describe("payNowLine refund sentence", () => {
  it("names the business cutoff for a deposit, never a fixed 24 hours", () => {
    expect(payNowLine(6000, 21_000, "XCD", 6)).toBe(
      "You pay a deposit of EC$60 now to hold this booking. The rest is paid at the business. Cancel at least 6 hours before to get your deposit back."
    );
    expect(payNowLine(6000, 21_000, "XCD", 1)).toContain(
      "Cancel at least 1 hour before to get your deposit back."
    );
  });

  it("says cancel before the start when the cutoff is zero", () => {
    expect(payNowLine(6000, 21_000, "XCD", 0)).toContain(
      "Cancel before your appointment starts to get your deposit back."
    );
  });

  it("adds no refund sentence for the full price, or when no cutoff is given", () => {
    expect(payNowLine(21_000, 21_000, "XCD", 6)).toBe(
      "You pay the full price, EC$210, now to hold this booking."
    );
    expect(payNowLine(6000, 21_000, "XCD")).not.toContain(
      "get your deposit back"
    );
  });
});

describe("payNowLine when the deposit is non-refundable", () => {
  it("states the move rule instead of the refund", () => {
    const line = payNowLine(6000, 21_000, "XCD", 6, true);
    expect(line).toContain(
      "Your deposit is non-refundable. You can move your booking up to 6 hours before; it stays with your booking."
    );
    expect(line).not.toContain("get your deposit back");
  });
});
