import { describe, expect, it } from "vitest";
import { cleanScan } from "@/lib/scan-value";

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
