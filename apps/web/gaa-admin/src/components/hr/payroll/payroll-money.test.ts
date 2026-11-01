import { describe, expect, it } from "vitest";
import {
  formatMoney,
  minorUnitDigits,
  parseMoneyToMinor,
  percentToRate,
} from "./payroll-money";

describe("payroll money", () => {
  it("uses the currency's minor-unit digits", () => {
    expect(minorUnitDigits("XCD")).toBe(2);
  });

  it("formats minor units in XCD and never shows unpriced as zero", () => {
    expect(formatMoney(123_450)).toContain("1,234.50");
    expect(formatMoney(0)).toContain("0.00");
    expect(formatMoney(null)).toBe("Not priced");
  });

  it("parses typed amounts into minor units", () => {
    expect(parseMoneyToMinor("1234.5")).toBe(123_450);
    expect(parseMoneyToMinor("EC$1,234.50")).toBe(123_450);
    expect(parseMoneyToMinor("$40")).toBe(4000);
  });

  it("rejects amounts with more decimals than the currency allows", () => {
    expect(parseMoneyToMinor("10.005")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
    expect(parseMoneyToMinor("")).toBeNull();
  });

  it("converts percent input to the API decimal fraction", () => {
    expect(percentToRate("10")).toBe("0.1000");
    expect(percentToRate("6.25%")).toBe("0.0625");
    expect(percentToRate("150")).toBeNull();
    expect(percentToRate("x")).toBeNull();
  });
});
