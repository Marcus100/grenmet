import { describe, expect, it } from "vitest";
import {
  BOOKING_POLICY_MAX,
  cleanPolicy,
  policyLength,
} from "./booking-policy-text";

describe("cleanPolicy", () => {
  it("keeps line breaks as \\n and trims the ends", () => {
    expect(
      cleanPolicy("  Late fee: EC$20.\r\n\r\nNo-shows pay in full.  ")
    ).toBe("Late fee: EC$20.\n\nNo-shows pay in full.");
  });

  it("is null for blank text", () => {
    expect(cleanPolicy("   \n  ")).toBeNull();
    expect(cleanPolicy("")).toBeNull();
  });

  it("leaves markup as plain text (it is escaped when shown)", () => {
    expect(cleanPolicy("<b>late</b>")).toBe("<b>late</b>");
  });
});

describe("policyLength", () => {
  it("counts code points, so an emoji is one character", () => {
    expect(policyLength("ab")).toBe(2);
    expect(policyLength("a😀")).toBe(2);
  });

  it("allows exactly the API limit", () => {
    expect(BOOKING_POLICY_MAX).toBe(1000);
    expect(policyLength("a".repeat(1000))).toBe(BOOKING_POLICY_MAX);
  });
});
