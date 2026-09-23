import { describe, expect, it } from "vitest";
import { formatFrequency } from "./format";

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
