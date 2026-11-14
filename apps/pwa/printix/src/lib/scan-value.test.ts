import { describe, expect, it } from "vitest";
import { cleanScan, formatLabel, isRepeat } from "@/lib/scan-value";

describe("cleanScan", () => {
  it("trims and keeps an ordinary value", () => {
    expect(cleanScan("  PX-000100 \n")).toBe("PX-000100");
  });

  it("removes control characters a barcode can carry", () => {
    expect(cleanScan("\u001d0100\u0000")).toBe("0100");
  });

  it("refuses an empty or oversized value", () => {
    expect(cleanScan(" \t ")).toBeNull();
    expect(cleanScan("9".repeat(201))).toBeNull();
  });
});

describe("formatLabel", () => {
  it("names the common ticket formats", () => {
    expect(formatLabel("code_128")).toBe("Code 128");
    expect(formatLabel("itf")).toBe("Interleaved 2 of 5");
  });

  it("falls back to the raw name without underscores", () => {
    expect(formatLabel("data_matrix")).toBe("data matrix");
  });
});

describe("isRepeat", () => {
  it("treats the same value seen again at once as a repeat", () => {
    expect(isRepeat({ value: "100", at: 1000 }, "100", 2000)).toBe(true);
  });

  it("reports a different value, or the same one after a pause", () => {
    expect(isRepeat({ value: "100", at: 1000 }, "099", 2000)).toBe(false);
    expect(isRepeat({ value: "100", at: 1000 }, "100", 4000)).toBe(false);
    expect(isRepeat(null, "100", 0)).toBe(false);
  });
});
