import { describe, expect, it } from "vitest";
import {
  bookingRulesLine,
  cancellationPolicyLine,
  depositRefundLine,
  holdEndsLine,
  holdLengthText,
  nonRefundableDepositLine,
} from "./booking-policy";

const GET_DEPOSIT_BACK = /get your deposit back/u;
const HOLD_SENTENCE =
  /^Your time is held until .* while we wait for your deposit\.$/u;

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
    expect(line).not.toContain("(");
  });

  it("names the hold length when the API gives it", () => {
    const line = holdEndsLine("2027-01-05T13:00:00Z", "America/Grenada", 1440);
    expect(line).toContain("9:00 am");
    expect(line).toContain(" (24 hours) while we wait for your deposit.");
  });
});

describe("holdLengthText", () => {
  it("words the hold in minutes, hours and days", () => {
    expect(holdLengthText(30)).toBe("30 minutes");
    expect(holdLengthText(120)).toBe("2 hours");
    expect(holdLengthText(60)).toBe("1 hour");
    expect(holdLengthText(1440)).toBe("24 hours");
    expect(holdLengthText(2880)).toBe("48 hours");
    expect(holdLengthText(4320)).toBe("3 days");
    expect(holdLengthText(10_080)).toBe("7 days");
    expect(holdLengthText(90)).toBe("90 minutes");
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
      "Your deposit is non-refundable once your booking is confirmed. You can move your booking up to 24 hours before; it stays with your booking."
    );
    expect(depositRefundLine(1, true)).toBe(
      "Your deposit is non-refundable once your booking is confirmed. You can move your booking up to 1 hour before; it stays with your booking."
    );
  });

  it("does not promise a refund anywhere in the sentence", () => {
    expect(nonRefundableDepositLine(24)).not.toMatch(GET_DEPOSIT_BACK);
  });

  it("says a move is possible at any time when there is no cutoff", () => {
    expect(depositRefundLine(0, true)).toBe(
      "Your deposit is non-refundable once your booking is confirmed. You can move your booking at any time before it starts; it stays with your booking."
    );
  });

  it("keeps the refundable wording when the switch is off", () => {
    expect(depositRefundLine(24, false)).toBe(
      "Cancel at least 24 hours before to get your deposit back."
    );
  });
});

describe("nonRefundableDepositLine once the booking is confirmed", () => {
  it("states the promise without the waiting clause", () => {
    expect(nonRefundableDepositLine(24, true)).toBe(
      "Your deposit is non-refundable. You can move your booking up to 24 hours before; it stays with your booking."
    );
  });

  it("is used for the manage page of a confirmed booking only", () => {
    expect(depositRefundLine(6, true, true)).toBe(
      "Your deposit is non-refundable. You can move your booking up to 6 hours before; it stays with your booking."
    );
    expect(depositRefundLine(6, true, false)).toContain(
      "once your booking is confirmed"
    );
  });
});

describe("bookingRulesLine", () => {
  const base = {
    businessName: "Babydoll",
    currency: "XCD",
    cutoffHours: 24,
    priceMinor: 12_000,
  };
  const CHANGE =
    "Change or cancel online up to 24 hours before; after that, contact Babydoll.";
  const REFUND = "refunded if you cancel at least 24 hours before it starts.";

  it("says only the change rule before a service is chosen", () => {
    expect(
      bookingRulesLine({
        businessName: "Babydoll",
        currency: "XCD",
        cutoffHours: 24,
      })
    ).toBe(CHANGE);
  });

  it("says no deposit when nothing is due (no rule, or minimum price not met)", () => {
    expect(bookingRulesLine({ ...base, dueMinor: 0 })).toBe(
      `No deposit for this service. ${CHANGE}`
    );
  });

  it("states the condition for a refundable deposit (kept inside the cut-off)", () => {
    expect(bookingRulesLine({ ...base, dueMinor: 3600 })).toBe(
      `EC$36 deposit, ${REFUND} ${CHANGE}`
    );
    expect(bookingRulesLine({ ...base, dueMinor: 5050 })).toBe(
      `EC$50.50 deposit, ${REFUND} ${CHANGE}`
    );
  });

  it("states the service's own deposit like any other", () => {
    expect(bookingRulesLine({ ...base, dueMinor: 2500 })).toBe(
      `EC$25 deposit, ${REFUND} ${CHANGE}`
    );
  });

  it("says a non-refundable deposit is so only once the booking is confirmed (form)", () => {
    expect(
      bookingRulesLine({ ...base, dueMinor: 4000, nonRefundable: true })
    ).toBe(
      `EC$40 deposit, not refundable once your booking is confirmed. ${CHANGE}`
    );
  });

  it("manage page: confirmed non-refundable reads not refundable", () => {
    expect(
      bookingRulesLine({
        ...base,
        bookingStatus: "confirmed",
        dueMinor: 4000,
        nonRefundable: true,
      })
    ).toBe(`EC$40 deposit, not refundable. ${CHANGE}`);
  });

  it("manage page: a pending booking follows the cut-off rule, even if non-refundable", () => {
    expect(
      bookingRulesLine({
        ...base,
        bookingStatus: "pending",
        dueMinor: 4000,
        nonRefundable: true,
      })
    ).toBe(`EC$40 deposit, ${REFUND} ${CHANGE}`);
    expect(
      bookingRulesLine({ ...base, bookingStatus: "pending", dueMinor: 4000 })
    ).toBe(`EC$40 deposit, ${REFUND} ${CHANGE}`);
  });

  it("manage page: pending payment makes no refund claim", () => {
    expect(
      bookingRulesLine({
        ...base,
        bookingStatus: "pending_payment",
        dueMinor: 4000,
        nonRefundable: true,
      })
    ).toBe(`No deposit has been taken yet. ${CHANGE}`);
  });

  it("says a full prepayment is paid when booking", () => {
    expect(bookingRulesLine({ ...base, dueMinor: 12_000 })).toBe(
      `EC$120 paid when you book, ${REFUND} ${CHANGE}`
    );
    expect(
      bookingRulesLine({ ...base, dueMinor: 12_000, nonRefundable: true })
    ).toBe(
      `EC$120 paid when you book, not refundable once your booking is confirmed. ${CHANGE}`
    );
  });

  it("says a deposit with no payment route is paid at the salon", () => {
    expect(
      bookingRulesLine({
        ...base,
        dueMinor: 0,
        nonRefundable: true,
        ownDepositMinor: 3000,
      })
    ).toBe(`EC$30 deposit, paid at the salon. ${CHANGE}`);
  });

  it("says before it starts when no cut-off is set", () => {
    expect(bookingRulesLine({ ...base, cutoffHours: 0, dueMinor: 4000 })).toBe(
      "EC$40 deposit, refunded if you cancel before it starts. Change or cancel online any time before it starts."
    );
    expect(bookingRulesLine({ ...base, cutoffHours: 0, dueMinor: 0 })).toBe(
      "No deposit for this service. Change or cancel online any time before it starts."
    );
  });

  it("falls back to 'the business' and uses the singular for one hour", () => {
    expect(
      bookingRulesLine({ currency: "USD", cutoffHours: 1, dueMinor: 1000 })
    ).toBe(
      "US$10 deposit, refunded if you cancel at least 1 hour before it starts. Change or cancel online up to 1 hour before; after that, contact the business."
    );
  });

  it("says a business deposit is paid to the business, never at the salon", () => {
    expect(
      bookingRulesLine({
        ...base,
        businessDepositMinor: 5300,
        dueMinor: 0,
        ownDepositMinor: 5300,
      })
    ).toBe(`EC$53 deposit, paid to the business. ${CHANGE}`);
  });
});
