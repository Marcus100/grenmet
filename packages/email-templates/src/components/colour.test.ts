import { describe, expect, it } from "vitest";
import { contrastWithWhite, NAVY, safeAccent } from "./colour";

/**
 * The same table as `tests/test_email_colour.py` (issue #1622): both languages must
 * print the same accent for every row.
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
