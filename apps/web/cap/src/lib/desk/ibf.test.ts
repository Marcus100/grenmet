import type { IbfMatrixPublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  colourWord,
  KIND_PATTERN,
  matrixView,
  suggestInputSchema,
} from "./ibf";

const STANDARD_GRID = /Standard World Meteorological/;
const WMO = {
  cells: [
    ["green", "green", "yellow", "orange"],
    ["green", "yellow", "orange", "red"],
  ],
  impacts: [
    { label: "Minimal", percent: null },
    { label: "Minor", percent: null },
    { label: "Significant", percent: null },
    { label: "Severe", percent: null },
  ],
  likelihoods: [
    { label: "Very low", percent: 5 },
    { label: "Low", percent: 30 },
  ],
  meanings: { green: "No action" },
} as unknown as IbfMatrixPublic;

describe("suggestInputSchema", () => {
  it("accepts a known hazard, likelihood and impact", () => {
    expect(
      suggestInputSchema.safeParse({
        impact: "Severe",
        kind: "flood",
        likelihood: "High",
      }).success
    ).toBe(true);
  });

  it("refuses an unknown likelihood or impact", () => {
    expect(
      suggestInputSchema.safeParse({
        impact: "Huge",
        kind: "flood",
        likelihood: "High",
      }).success
    ).toBe(false);
  });

  it("refuses a hazard key that is not the API's pattern", () => {
    expect(KIND_PATTERN.test("../etc")).toBe(false);
    expect(KIND_PATTERN.test("Flood")).toBe(false);
    expect(KIND_PATTERN.test("flood-2")).toBe(true);
  });
});

describe("matrixView", () => {
  it("lays the grid out with likelihood down and impact across", () => {
    const view = matrixView(WMO, "flood");
    expect(view.rows.map((row) => row.label)).toEqual(["Very low", "Low"]);
    expect(view.columns.map((column) => column.label)).toEqual([
      "Minimal",
      "Minor",
      "Significant",
      "Severe",
    ]);
    expect(view.rows[1]?.cells[3]).toEqual({ colour: "red", word: "Red" });
  });

  it("says the standard grid is used when no approved grid exists", () => {
    expect(matrixView(WMO, "flood").source).toMatch(STANDARD_GRID);
  });

  it("names the approved library grid and version when one sets its own", () => {
    const view = matrixView(
      {
        ...WMO,
        library_key: "ibf-flood",
        library_version: 4,
      } as IbfMatrixPublic,
      "flood"
    );
    expect(view.source).toBe("Approved library grid for flood, version 4.");
  });

  it("names a colour in words", () => {
    expect(colourWord("orange")).toBe("Orange");
    expect(colourWord("mauve")).toBe("mauve");
  });
});
