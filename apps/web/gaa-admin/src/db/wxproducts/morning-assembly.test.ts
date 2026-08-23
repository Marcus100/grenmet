import { describe, expect, it } from "vitest";
import { EMPTY_FORECAST } from "@/components/wxproducts/forecast-document";
import {
  buildMorningProduct,
  dailySuiteId,
  morningProductId,
} from "@/db/wxproducts/morning-assembly";

const ISSUED = new Date("2026-08-20T10:00:00Z");

function values(overrides: Partial<typeof EMPTY_FORECAST> = {}) {
  return {
    ...EMPTY_FORECAST,
    dateIssued: "2026-08-20",
    forecasterName: "E. Gould",
    summary: "Partly cloudy with isolated showers",
    ...overrides,
  };
}

describe("identifiers", () => {
  it("names a forecast by its type and date", () => {
    expect(morningProductId("2026-08-20")).toBe("GMS-MORNING-2026-08-20");
  });

  it("puts every product issued that day in one suite", () => {
    expect(dailySuiteId("2026-08-20")).toBe("GMS-DAILY-SUITE-2026-08-20");
  });
});

describe("buildMorningProduct", () => {
  it("carries the forecaster, area and type into the metadata", () => {
    const product = buildMorningProduct(values(), ISSUED);
    expect(product.product_metadata.forecaster.name).toBe("E. Gould");
    expect(product.product_metadata.product_type).toBe("morning_forecast");
    expect(product.product_metadata.product_id).toBe("GMS-MORNING-2026-08-20");
  });

  it("covers today 6am to tomorrow 6am without the forecaster typing it", () => {
    const { validity } = buildMorningProduct(values(), ISSUED).product_metadata;
    expect(validity.valid_from_local).toBe("2026-08-20T06:00:00");
    expect(validity.valid_to_local).toBe("2026-08-21T06:00:00");
    expect(validity.valid_duration_hours).toBe(24);
  });

  it("rolls the validity window across a month boundary", () => {
    const { validity } = buildMorningProduct(
      values({ dateIssued: "2026-08-31" }),
      ISSUED
    ).product_metadata;
    expect(validity.valid_to_local).toBe("2026-09-01T06:00:00");
  });

  it("starts a first issue at version 1, replacing nothing", () => {
    const { versioning } = buildMorningProduct(
      values(),
      ISSUED
    ).product_metadata;
    expect(versioning.version).toBe(1);
    expect(versioning.replaces_product_id).toBeNull();
    expect(versioning.is_correction).toBe(false);
  });

  it("increments the version on reissue and names what it replaces", () => {
    const { versioning } = buildMorningProduct(values(), ISSUED, {
      changeSummary: "Corrected the maximum temperature",
      isCorrection: true,
      previousVersion: 1,
    }).product_metadata;
    expect(versioning.version).toBe(2);
    expect(versioning.is_correction).toBe(true);
    expect(versioning.change_summary).toBe("Corrected the maximum temperature");
    expect(versioning.replaces_product_id).toBe("GMS-MORNING-2026-08-20");
  });

  it("structures the wind, temperature, tides and astronomy the forecaster typed", () => {
    const product = buildMorningProduct(
      values({
        highTide: "4:45 pm",
        lowTide: "10:30 am",
        maxTemperature: "31",
        minTemperature: "26",
        sunrise: "5:42 am",
        sunset: "6:25 pm",
        windDirection: "E to SE",
        windSpeed: "15-25 mph",
      }),
      ISSUED
    );
    const { elements } = product.forecast;
    expect(elements.wind).toEqual({
      direction_max: "SE",
      direction_min: "E",
      speed_max: 25,
      speed_min: 15,
      speed_unit: "mph",
    });
    expect(elements.temperature).toEqual({ max_c: 31, min_c: 26 });
    expect(elements.tides?.events).toHaveLength(2);
    expect(elements.sun_moon?.sunrise_local).toBe("05:42");
  });

  it("omits an element rather than storing an unreadable value", () => {
    const product = buildMorningProduct(
      values({ windDirection: "variable", windSpeed: "light and variable" }),
      ISSUED
    );
    expect(product.forecast.elements.wind).toBeUndefined();
  });

  it("does not record the no-alert placeholder as an advisory", () => {
    const product = buildMorningProduct(
      values({ wxWarning: "No Weather-related Alert" }),
      ISSUED
    );
    expect(product.forecast.product_notes).toBeNull();
  });

  it("records real warnings as advisories", () => {
    const product = buildMorningProduct(
      values({
        windWarning: "Small craft advisory in effect",
        wxWarning: "Flash flood watch",
      }),
      ISSUED
    );
    expect(product.forecast.product_notes?.advisories_text).toEqual([
      "Flash flood watch",
      "Small craft advisory in effect",
    ]);
  });

  it("falls back to the issue date when the form has none", () => {
    const product = buildMorningProduct(values({ dateIssued: "" }), ISSUED);
    expect(product.product_metadata.product_id).toBe("GMS-MORNING-2026-08-20");
  });
});

describe("draft and published status", () => {
  it("defaults to a draft, so nothing is published by omission", () => {
    const product = buildMorningProduct(values(), ISSUED);
    expect(product.product_metadata.status).toBe("draft");
  });

  it("marks the forecast operational only when asked to publish", () => {
    const product = buildMorningProduct(values(), ISSUED, {
      status: "operational",
    });
    expect(product.product_metadata.status).toBe("operational");
  });

  it("keeps versioning independent of status, so a draft reissue still counts", () => {
    const product = buildMorningProduct(values(), ISSUED, {
      previousVersion: 2,
      status: "draft",
    });
    expect(product.product_metadata.versioning.version).toBe(3);
  });
});
