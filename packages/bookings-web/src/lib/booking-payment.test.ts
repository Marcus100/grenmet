import type { BookingPaymentSummary } from "@barrelsgd/api-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  paymentLine,
  recallManagePath,
  rememberManagePath,
  safeCheckoutUrl,
} from "./booking-payment";

const due: BookingPaymentSummary = {
  status: "due",
  amount_minor: 21_000,
  paid_minor: 0,
  refunded_minor: 0,
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
