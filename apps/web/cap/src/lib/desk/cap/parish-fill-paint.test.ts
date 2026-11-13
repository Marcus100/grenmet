import { describe, expect, it } from "vitest";
import { buildParishFillPaint } from "./parish-fill-paint";

const LAND = "#d9cdaf";
const SELECTED = "#d97706";

describe("buildParishFillPaint", () => {
  it("returns a plain land colour when no parish is selected", () => {
    expect(
      buildParishFillPaint({
        landColour: LAND,
        selectedIds: [],
        selectedColour: SELECTED,
      })
    ).toBe(LAND);
  });

  it("returns a valid match expression with label/output pairs and a fallback when parishes are selected", () => {
    const paint = buildParishFillPaint({
      landColour: LAND,
      selectedIds: ["GD-01", "GD-06"],
      selectedColour: SELECTED,
    });
    expect(paint).toEqual([
      "match",
      ["get", "id"],
      "GD-01",
      SELECTED,
      "GD-06",
      SELECTED,
      LAND,
    ]);
  });

  it("never emits a match with no label/output pair", () => {
    const paint = buildParishFillPaint({
      landColour: LAND,
      selectedIds: ["GD-01"],
      selectedColour: SELECTED,
    });
    // ["match", input, label, output, fallback] is the smallest valid form.
    expect(Array.isArray(paint)).toBe(true);
    expect((paint as readonly unknown[]).length).toBeGreaterThanOrEqual(5);
    expect((paint as readonly unknown[]).length % 2).toBe(1);
  });

  it("drops duplicate ids so every match label is unique", () => {
    const paint = buildParishFillPaint({
      landColour: LAND,
      selectedIds: ["GD-01", "GD-01"],
      selectedColour: SELECTED,
    });
    expect(paint).toEqual(["match", ["get", "id"], "GD-01", SELECTED, LAND]);
  });
});
