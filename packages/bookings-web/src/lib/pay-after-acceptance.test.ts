import type { BookingPaymentSummary } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  acceptedAwaitingPayment,
  awaitsAcceptance,
  payAfterAcceptanceLine,
  payLaterLine,
  paymentLine,
} from "./booking-payment";
import { bookingRulesLine, holdEndsLine } from "./booking-policy";

const PAY_BY = /^Pay by .*5 January 2027, 9:00 am/u;
const TEN_HOURS = /10 hours/u;
const RELEASED = /after that it is released/u;

const due: BookingPaymentSummary = {
  status: "due",
  amount_minor: 5000,
  paid_minor: 0,
  refunded_minor: 0,
  balance_at_salon_minor: 16_000,
  currency: "XCD",
  checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
};

describe("a request paid after the business accepts", () => {
  it("knows the two states from the booking alone", () => {
    const request = { pay_after_acceptance: true, status: "pending" };
    const accepted = { pay_after_acceptance: true, status: "pending_payment" };
    expect(awaitsAcceptance(request)).toBe(true);
    expect(acceptedAwaitingPayment(request)).toBe(false);
    expect(awaitsAcceptance(accepted)).toBe(false);
    expect(acceptedAwaitingPayment(accepted)).toBe(true);
    // A payment at booking, and older payloads without the field, are neither.
    for (const status of ["pending", "pending_payment", "confirmed"]) {
      expect(awaitsAcceptance({ status })).toBe(false);
      expect(acceptedAwaitingPayment({ status })).toBe(false);
    }
    expect(
      awaitsAcceptance({ pay_after_acceptance: true, status: "confirmed" })
    ).toBe(false);
  });

  it("says on the form that nothing is paid now, and what follows", () => {
    expect(payAfterAcceptanceLine(5000, 21_000, "XCD", "Babydoll")).toBe(
      "Nothing to pay now. This is a request: if Babydoll accepts it, we will email you to pay a deposit of EC$50 (the rest is paid at the business)."
    );
    expect(payAfterAcceptanceLine(21_000, 21_000, "XCD", " ")).toBe(
      "Nothing to pay now. This is a request: if the business accepts it, we will email you to pay the full price, EC$210."
    );
    expect(payAfterAcceptanceLine(0, 21_000, "XCD", "Babydoll")).toBeNull();
  });

  it("says after booking that the customer pays when the business accepts", () => {
    expect(payLaterLine(5000, "XCD", "Babydoll")).toBe(
      "Nothing to pay yet. We will email you when Babydoll accepts. You pay then (EC$50)."
    );
    expect(payLaterLine(0, "XCD", "")).toBe(
      "Nothing to pay yet. We will email you when the business accepts. You pay then."
    );
  });

  it("asks for the payment once the business accepted", () => {
    expect(paymentLine(due, { businessName: "Babydoll" })).toBe(
      "Babydoll accepted your request. Pay EC$50 to confirm your booking."
    );
    // Without the acceptance the line is the one for a payment at booking.
    expect(paymentLine(due)).toBe(
      "Payment of EC$50 not received yet. Your time is held until it arrives."
    );
  });

  it("states the deadline, not a length, after acceptance", () => {
    const line = holdEndsLine(
      "2027-01-05T13:00:00Z",
      "America/Grenada",
      600,
      true
    );
    expect(line).toMatch(PAY_BY);
    expect(line).not.toMatch(TEN_HOURS);
    expect(line).toMatch(RELEASED);
  });
});

describe("bookingRulesLine for a request paid after acceptance", () => {
  const base = {
    businessName: "Babydoll",
    currency: "XCD",
    cutoffHours: 24,
    dueMinor: 5000,
    payAfterAcceptance: true,
    priceMinor: 21_000,
  };
  const CHANGE =
    "Change or cancel online up to 24 hours before; after that, contact Babydoll.";

  it("says on the form that the deposit is paid after acceptance", () => {
    expect(bookingRulesLine(base)).toBe(
      `EC$50 deposit, paid after your request is accepted, refunded if you cancel at least 24 hours before it starts. ${CHANGE}`
    );
    expect(bookingRulesLine({ ...base, dueMinor: 21_000 })).toBe(
      `EC$210 paid after your request is accepted, refunded if you cancel at least 24 hours before it starts. ${CHANGE}`
    );
  });

  it("makes no money claim while the request waits", () => {
    expect(bookingRulesLine({ ...base, bookingStatus: "pending" })).toBe(
      `Nothing to pay yet. ${CHANGE}`
    );
    expect(
      bookingRulesLine({ ...base, bookingStatus: "pending_payment" })
    ).toBe(`No deposit has been taken yet. ${CHANGE}`);
  });

  it("reads as any paid deposit once confirmed", () => {
    expect(bookingRulesLine({ ...base, bookingStatus: "confirmed" })).toBe(
      `EC$50 deposit, refunded if you cancel at least 24 hours before it starts. ${CHANGE}`
    );
  });

  it("leaves a payment at booking as it was", () => {
    expect(bookingRulesLine({ ...base, payAfterAcceptance: false })).toBe(
      `EC$50 deposit, refunded if you cancel at least 24 hours before it starts. ${CHANGE}`
    );
  });
});
