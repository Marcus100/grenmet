import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, money, subtractMoney, sumMoney } from "./money";

const MIXED_CURRENCY_MESSAGE = /Cannot combine XCD with USD/;

describe("formatMoney", () => {
  it("groups thousands and keeps two decimals by default", () => {
    expect(formatMoney(money(1_688_420, "XCD"))).toBe("$16,884.20");
  });

  it("drops the decimals when asked", () => {
    expect(formatMoney(money(1_842_000, "XCD"), { decimals: false })).toBe(
      "$18,420"
    );
  });

  it("rounds to the nearest major unit when hiding decimals", () => {
    expect(formatMoney(money(1_688_420, "XCD"), { decimals: false })).toBe(
      "$16,884"
    );
    expect(formatMoney(money(1_688_480, "XCD"), { decimals: false })).toBe(
      "$16,885"
    );
  });

  it("pads a single-digit cent value", () => {
    expect(formatMoney(money(1005, "XCD"))).toBe("$10.05");
  });

  it("formats zero", () => {
    expect(formatMoney(money(0, "XCD"), { decimals: false })).toBe("$0");
  });

  it("marks a negative amount with a minus sign", () => {
    expect(formatMoney(money(-24_000, "XCD"))).toBe("−$240.00");
  });

  it("does not drift on a value that is inexact as a float", () => {
    // 0.1 + 0.2 style drift would surface here if amounts were divided first.
    expect(formatMoney(money(1070, "XCD"))).toBe("$10.70");
    expect(formatMoney(money(2940, "XCD"))).toBe("$29.40");
  });
});

describe("money arithmetic", () => {
  it("adds and subtracts in minor units", () => {
    expect(addMoney(money(1000, "XCD"), money(550, "XCD"))).toEqual(
      money(1550, "XCD")
    );
    expect(subtractMoney(money(1000, "XCD"), money(550, "XCD"))).toEqual(
      money(450, "XCD")
    );
  });

  it("sums an empty list to zero", () => {
    expect(sumMoney([], "XCD")).toEqual(money(0, "XCD"));
  });

  it("refuses to combine different currencies", () => {
    expect(() => addMoney(money(100, "XCD"), money(100, "USD"))).toThrow(
      MIXED_CURRENCY_MESSAGE
    );
  });
});
