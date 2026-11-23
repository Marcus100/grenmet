import { describe, expect, it } from "vitest";
import { cancellationPolicyLine, holdEndsLine } from "./booking-policy";

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
