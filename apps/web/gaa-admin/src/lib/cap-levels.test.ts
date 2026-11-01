import { describe, expect, it } from "vitest";
import { gmsCatalogueFixture } from "@/test/cap-gms-catalogue.fixture";
import {
  awarenessValue,
  colourLabel,
  levelHeading,
  levelParameters,
  needsColour,
  productLabel,
  productTitle,
  sectorParameters,
  severityForColour,
} from "./cap-levels";

describe("GMS colours follow the MeteoAlarm CAP profile", () => {
  it.each([
    ["green", "1; green; Minor", "Minor"],
    ["yellow", "2; yellow; Moderate", "Moderate"],
    ["orange", "3; orange; Severe", "Severe"],
    ["red", "4; red; Extreme", "Extreme"],
  ] as const)("%s", (colour, value, severity) => {
    expect(awarenessValue(gmsCatalogueFixture, colour)).toBe(value);
    expect(severityForColour(gmsCatalogueFixture, colour)).toBe(severity);
  });
});

describe("levelParameters", () => {
  it("never gives an Outlook a colour", () => {
    expect(levelParameters(gmsCatalogueFixture, "Outlook", "red")).toEqual([
      { value_name: "GMS:product", value: "Outlook" },
    ]);
  });

  it("carries product and colour for a Watch", () => {
    expect(levelParameters(gmsCatalogueFixture, "Watch", "orange")).toEqual([
      { value_name: "GMS:product", value: "Watch" },
      { value_name: "awareness_level", value: "3; orange; Severe" },
    ]);
  });
});

describe("catalogue-driven rules", () => {
  it("reads the colour label and the outlook rule from the catalogue", () => {
    expect(colourLabel(gmsCatalogueFixture, "orange")).toBe("Orange");
    expect(needsColour(gmsCatalogueFixture, "Outlook")).toBe(false);
    expect(needsColour(gmsCatalogueFixture, "Warning")).toBe(true);
    expect(productLabel(gmsCatalogueFixture, "Advisory")).toBe(
      "Small Craft Advisory"
    );
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
    expect(levelHeading(gmsCatalogueFixture, "Heat", "Watch", "orange")).toBe(
      "Orange · Heat Watch"
    );
  });

  it("labels an Outlook without a colour", () => {
    expect(levelHeading(gmsCatalogueFixture, "Heat", "Outlook", null)).toBe(
      "Outlook · Heat Outlook"
    );
  });
});

describe("sectorParameters", () => {
  it("writes the tag in menu order, and writes nothing when no sector is chosen", () => {
    expect(sectorParameters(["health", "tourism"])).toEqual([
      { value_name: "GMS:sectors", value: "tourism,health" },
    ]);
    expect(sectorParameters([])).toEqual([]);
  });
});
