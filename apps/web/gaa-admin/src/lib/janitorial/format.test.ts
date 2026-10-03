import { describe, expect, it } from "vitest";
import { formatFrequency, formatPerDay } from "./format";

describe("formatFrequency", () => {
  it("formats singular and plural periods", () => {
    expect(
      formatFrequency({ count: 2, periodValue: 1, periodUnit: "day" })
    ).toBe("2×/day");
    expect(
      formatFrequency({ count: 3, periodValue: 5, periodUnit: "day" })
    ).toBe("3×/5 days");
    expect(
      formatFrequency({ count: 1, periodValue: 15, periodUnit: "minute" })
    ).toBe("1×/15 mins");
  });
});

describe("formatPerDay", () => {
  it("keeps one decimal below ten and rounds from ten up", () => {
    expect(formatPerDay(0.6)).toBe("0.6");
    expect(formatPerDay(2)).toBe("2");
    expect(formatPerDay(96.4)).toBe("96");
    expect(formatPerDay(1234.2)).toBe("1,234");
  });
});
