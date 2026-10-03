import { describe, expect, it } from "vitest";
import {
  awarenessValue,
  levelHeading,
  levelParameters,
  productTitle,
  severityForColour,
} from "./cap-levels";

describe("GMS colours follow the MeteoAlarm CAP profile", () => {
  it.each([
    ["green", "1; green; Minor", "Minor"],
    ["yellow", "2; yellow; Moderate", "Moderate"],
    ["orange", "3; orange; Severe", "Severe"],
    ["red", "4; red; Extreme", "Extreme"],
  ] as const)("%s", (colour, value, severity) => {
    expect(awarenessValue(colour)).toBe(value);
    expect(severityForColour(colour)).toBe(severity);
  });
});

describe("levelParameters", () => {
  it("never gives an Outlook a colour", () => {
    expect(levelParameters("Outlook", "red")).toEqual([
      { value_name: "GMS:product", value: "Outlook" },
    ]);
  });

  it("carries product and colour for a Watch", () => {
    expect(levelParameters("Watch", "orange")).toEqual([
      { value_name: "GMS:product", value: "Watch" },
      { value_name: "awareness_level", value: "3; orange; Severe" },
    ]);
  });
});

describe("productTitle", () => {
  it("appends the product to a bare hazard", () => {
    expect(productTitle("Heat", "Watch")).toBe("Heat Watch");
  });

  it("replaces a product word already in the event", () => {
    expect(productTitle("Heavy Rainfall Watch", "Warning")).toBe(
      "Heavy Rainfall Warning"
    );
    expect(productTitle("Tropical Storm Warning", "Warning")).toBe(
      "Tropical Storm Warning"
    );
  });

  it("leaves the event alone when no product is chosen", () => {
    expect(productTitle("Heat", null)).toBe("Heat");
  });
});

describe("levelHeading", () => {
  it("leads with the colour", () => {
    expect(levelHeading("Heat", "Watch", "orange")).toBe("Orange · Heat Watch");
  });

  it("labels an Outlook without a colour", () => {
    expect(levelHeading("Heat", "Outlook", null)).toBe(
      "Outlook · Heat Outlook"
    );
  });
});
