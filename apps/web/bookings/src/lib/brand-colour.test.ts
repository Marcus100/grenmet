import { describe, expect, it } from "vitest";
import {
  checkBrandColour,
  contrastWithWhite,
  NAVY,
  safeAccent,
} from "./brand-colour";

/**
 * The same table as `packages/email-templates/src/components/colour.test.ts` and
 * `tests/test_email_colour.py` (issue #1622): every language prints the same
 * accent for each row.
 */
const ACCENT_CASES: [string | null | undefined, string][] = [
  ["#0b63ee", "#0b63ee"],
  ["#0B63EE", "#0b63ee"],
  ["#2563eb", "#2563eb"],
  ["#0b132b", "#0b132b"],
  // 4.54:1 against white: passes. 4.48:1: fails, so navy.
  ["#767676", "#767676"],
  ["#777777", NAVY],
  ["#ff0000", NAVY],
  ["#ffff00", NAVY],
  ["#ffc0cb", NAVY],
  ["#fff", NAVY],
  ["#0b63ee00", NAVY],
  [" #0b63ee", NAVY],
  ["red", NAVY],
  ["url(javascript:1)", NAVY],
  ["", NAVY],
  [null, NAVY],
  [undefined, NAVY],
];

describe("safeAccent", () => {
  it.each(ACCENT_CASES)("prints %j as %j", (stored, printed) => {
    expect(safeAccent(stored)).toBe(printed);
  });

  it("keeps the contrast rule at the boundary", () => {
    expect(contrastWithWhite("#767676")).toBeGreaterThanOrEqual(4.5);
    expect(contrastWithWhite("#777777")).toBeLessThan(4.5);
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 5);
  });
});

describe("checkBrandColour", () => {
  it("says nothing is set for an empty field", () => {
    expect(checkBrandColour("")).toEqual({ kind: "empty" });
  });

  it.each(["0b63ee", "#0b63e", "#0b63eeff", "#gggggg", " #0b63ee", "red"])(
    "flags %j as invalid, not as a colour",
    (text) => {
      expect(checkBrandColour(text)).toEqual({ kind: "invalid" });
    }
  );

  it("passes a colour that clears 4.5:1 and reports its ratio", () => {
    const check = checkBrandColour("#0B63EE");
    expect(check).toEqual({
      kind: "pass",
      hex: "#0b63ee",
      ratio: expect.any(Number),
    });
    if (check.kind !== "pass") {
      throw new Error("expected a pass");
    }
    expect(check.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back for a pale colour, and never rounds a failing ratio up to 4.5", () => {
    expect(checkBrandColour("#777777")).toEqual({
      kind: "fallback",
      hex: "#777777",
      ratio: 4.4,
    });
    expect(checkBrandColour("#ffff00")).toMatchObject({ kind: "fallback" });
  });

  it("agrees with safeAccent for every row of the table", () => {
    for (const [stored] of ACCENT_CASES) {
      if (typeof stored !== "string") {
        continue;
      }
      const check = checkBrandColour(stored);
      const printed = safeAccent(stored);
      if (check.kind === "pass") {
        expect(printed).toBe(check.hex);
      } else {
        expect(printed).toBe(NAVY);
      }
    }
  });
});
