import { describe, expect, it } from "vitest";
import {
  bothUnits,
  convertFigure,
  formatMeasure,
  isUnitSystem,
  knotsFromKmh,
  unitSuffix,
} from "@/lib/units";

describe("units", () => {
  it.each([
    ["temperature", 31, "imperial", "88"],
    ["temperature", 31.5, "metric", "31.5"],
    ["speed", 10, "imperial", "12"],
    ["speed", 10, "metric", "19"],
    ["height", 1.5, "imperial", "5"],
    ["height", 1.5, "metric", "1.5"],
    ["distance", 10, "imperial", "6.2"],
    ["pressure", 1013.25, "imperial", "29.92"],
    ["pressure", 1013.25, "metric", "1013.3"],
    ["rain", 25.4, "imperial", "1"],
    ["rain", 2.5, "metric", "2.5"],
  ] as const)("converts %s %s to %s as %s", (quantity, value, system, text) => {
    expect(convertFigure(quantity, value, system)).toBe(text);
  });

  it("names the unit", () => {
    expect(unitSuffix("speed", "imperial")).toBe(" mph");
    expect(unitSuffix("speed", "metric")).toBe(" km/h");
  });

  it("formats a single value, a range and a prefix", () => {
    expect(
      formatMeasure({ low: 14, quantity: "speed", prefix: "ENE " }, "imperial")
    ).toBe("ENE 16 mph");
    expect(
      formatMeasure({ high: 22, low: 10, quantity: "speed" }, "metric")
    ).toBe("19–41 km/h");
  });

  it("collapses a range whose ends round the same", () => {
    expect(
      formatMeasure({ high: 10.1, low: 10, quantity: "speed" }, "imperial")
    ).toBe("12 mph");
  });

  it("shows a bare temperature as a degree sign, with decimals overridden", () => {
    expect(
      formatMeasure(
        { bare: true, low: 31.2, places: 0, quantity: "temperature" },
        "metric"
      )
    ).toBe("31°");
    expect(
      formatMeasure(
        { bare: true, low: 31.2, quantity: "temperature" },
        "metric"
      )
    ).toBe("31.2°");
  });

  it("has nothing to show without a figure", () => {
    expect(
      formatMeasure({ low: null, quantity: "rain" }, "imperial")
    ).toBeNull();
    expect(bothUnits({ low: null, quantity: "rain" })).toBeNull();
  });

  it("gives both renderings", () => {
    expect(bothUnits({ low: 1013.25, quantity: "pressure" })).toEqual({
      imperial: "29.92 inHg",
      metric: "1013.3 hPa",
    });
  });

  it("recognises a unit system", () => {
    expect(isUnitSystem("metric")).toBe(true);
    expect(isUnitSystem("furlongs")).toBe(false);
  });

  it("takes a km/h speed through knots and back to the same km/h", () => {
    const measure = {
      quantity: "speed" as const,
      low: knotsFromKmh(63),
      high: knotsFromKmh(118),
    };
    expect(formatMeasure(measure, "metric")).toBe("63–118 km/h");
    expect(formatMeasure(measure, "imperial")).toBe("39–73 mph");
  });
});
