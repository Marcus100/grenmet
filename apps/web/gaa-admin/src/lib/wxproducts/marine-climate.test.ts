import {
  emptyProduct,
  nextClimateIssue,
  previousMonth,
  productFields,
} from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import { climateFigureRows } from "@/components/wxproducts/climate-figures";

const TYPED_FIGURE = /rainfall_mm|Mm$|Temperature$/u;

describe("Marine Forecast", () => {
  it("is issued at 05:00 and valid until 05:00 the next day", () => {
    const values = emptyProduct("marine-forecast", "2026-11-30");
    expect(values.issuedAt).toBe("2026-11-30T05:00");
    expect(values.validFrom).toBe("2026-11-30T05:00");
    expect(values.validTo).toBe("2026-12-01T05:00");
  });

  it("asks for synopsis, winds, seas, small-craft advice and outlook", () => {
    const keys = productFields("marine-forecast").map((f) => f.key);
    for (const key of [
      "synopsis",
      "windDirFrom",
      "seaStateFrom",
      "swellDir",
      "smallCraft",
      "outlook",
    ])
      expect(keys).toContain(key);
  });
});

describe("Climate Bulletin", () => {
  it("reviews the previous month and runs to the next 15th", () => {
    const values = emptyProduct("climate-bulletin", "2026-11-15");
    expect(values.month).toBe("2026-10");
    expect(values.validTo).toBe("2026-12-15T23:59");
    expect(previousMonth("2026-01-15")).toBe("2025-12");
    expect(nextClimateIssue("2026-11-14")).toBe("2026-11-15");
    expect(nextClimateIssue("2026-11-15")).toBe("2026-12-15");
    expect(nextClimateIssue("2026-12-20")).toBe("2027-01-15");
  });

  it("stores no typed figures", () => {
    const keys = productFields("climate-bulletin").map((f) => f.key);
    expect(keys.some((k) => TYPED_FIGURE.test(k))).toBe(false);
  });

  it("shows unreported register figures as not reported, never zero", () => {
    const rows = climateFigureRows({
      station_id: "78958",
      month: "2026-10",
      period_start: "2026-10-01T00:00:00Z",
      period_end: "2026-11-01T00:00:00Z",
      last_observation_at: "2026-10-31T21:00:00Z",
      observation_count: 200,
      days_elapsed: 31,
      rain_report_days: 30,
      rainfall_mm: 0,
      rain_days: null,
      rain_day_threshold_mm: 0.2,
      heavy_rain_threshold_mm: 10,
    } as Parameters<typeof climateFigureRows>[0]);
    expect(rows[0]).toEqual({ label: "Rainfall", value: "0 mm" });
    expect(rows[1]).toEqual({ label: "Rain days", value: "Not reported" });
  });
});
