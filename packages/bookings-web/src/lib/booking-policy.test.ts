import { describe, expect, it } from "vitest";
import {
  cancellationPolicyLine,
  depositRefundLine,
  holdEndsLine,
  nonRefundableDepositLine,
} from "./booking-policy";

const GET_DEPOSIT_BACK = /get your deposit back/u;
const HOLD_SENTENCE =
  /^Your time is held until .*\. It is released if the payment has not arrived by then\.$/u;

describe("cancellationPolicyLine", () => {
  it("names the cutoff in hours, with the right noun", () => {
    expect(cancellationPolicyLine(24)).toBe(
      "You can cancel or change this booking online until 24 hours before it starts."
    );
    expect(cancellationPolicyLine(1)).toBe(
      "You can cancel or change this booking online until 1 hour before it starts."
    );
  });

  it("says the booking can change until it starts when there is no cutoff", () => {
    expect(cancellationPolicyLine(0)).toBe(
      "You can cancel or change this booking online until it starts."
    );
  });
});

describe("holdEndsLine", () => {
  it("gives the release time on the business's clock", () => {
    const line = holdEndsLine("2027-01-05T13:00:00Z", "America/Grenada");
    // 13:00 UTC is 9:00 am in Grenada (UTC-4, no daylight saving).
    expect(line).toContain("9:00 am");
    expect(line).toContain("5 January 2027");
    expect(line).toMatch(HOLD_SENTENCE);
  });
});

describe("depositRefundLine", () => {
  it("is built from the business cutoff", () => {
    expect(depositRefundLine(24)).toBe(
      "Cancel at least 24 hours before to get your deposit back."
    );
    expect(depositRefundLine(48)).toBe(
      "Cancel at least 48 hours before to get your deposit back."
    );
    expect(depositRefundLine(1)).toBe(
      "Cancel at least 1 hour before to get your deposit back."
    );
  });

  it("says before the start when there is no cutoff", () => {
    expect(depositRefundLine(0)).toBe(
      "Cancel before your appointment starts to get your deposit back."
    );
  });
});

describe("depositRefundLine when the deposit is non-refundable", () => {
  it("replaces the refund promise with the move rule, from the cutoff", () => {
    expect(depositRefundLine(24, true)).toBe(
      "Your deposit is non-refundable. You can move your booking up to 24 hours before; it stays with your booking."
    );
    expect(depositRefundLine(1, true)).toBe(
      "Your deposit is non-refundable. You can move your booking up to 1 hour before; it stays with your booking."
    );
  });

  it("does not promise a refund anywhere in the sentence", () => {
    expect(nonRefundableDepositLine(24)).not.toMatch(GET_DEPOSIT_BACK);
  });

  it("says a move is possible at any time when there is no cutoff", () => {
    expect(depositRefundLine(0, true)).toBe(
      "Your deposit is non-refundable. You can move your booking at any time before it starts; it stays with your booking."
    );
  });

  it("keeps the refundable wording when the switch is off", () => {
    expect(depositRefundLine(24, false)).toBe(
      "Cancel at least 24 hours before to get your deposit back."
    );
  });
});
