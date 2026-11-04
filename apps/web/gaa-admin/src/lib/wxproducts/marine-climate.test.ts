import {
  capInsertTargets,
  displayProductFields,
  emptyProduct,
  forecastSchedule,
  isForecastKind,
  isHiddenForecastField,
  nextClimateIssue,
  previousMonth,
  productFields,
  SPI_CATEGORIES,
  withForecastSchedule,
} from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import { climateFigureRows } from "@/components/wxproducts/climate-figures";

const TYPED_FIGURE = /rainfall_mm|Mm$|Temperature$|^(rainfall|rainDays)$/u;

describe("Marine Forecast", () => {
  it("is issued at 05:00 and valid until 05:00 the next day", () => {
    const values = emptyProduct("marine-forecast", "2026-11-30");
    expect(values.issuedAt).toBe("2026-11-30T05:00");
    expect(values.validFrom).toBe("2026-11-30T05:00");
    expect(values.validTo).toBe("2026-12-01T05:00");
  });

  it("asks for synopsis, winds, seas and outlook", () => {
    const keys = productFields("marine-forecast").map((f) => f.key);
    for (const key of [
      "synopsis",
      "windDirFrom",
      "seaStateFrom",
      "swellDir",
      "outlook",
    ])
      expect(keys).toContain(key);
  });

  it("is a forecast whose small craft line comes from imported advisories", () => {
    expect(isForecastKind("marine-forecast")).toBe(true);
    const keys = productFields("marine-forecast").map((f) => f.key);
    expect(keys).not.toContain("smallCraft");
    expect(keys).not.toContain("smallCraftNotes");
    expect(keys).toContain("advisories");
    expect(
      displayProductFields("marine-forecast").map((f) => f.key)
    ).not.toContain("smallCraft");
    expect(
      productFields("marine-forecast").some((f) =>
        isHiddenForecastField("marine-forecast", f)
      )
    ).toBe(false);
  });

  it("keeps its own 05:00 to 05:00 schedule under the forecast rules", () => {
    const schedule = forecastSchedule("marine-forecast", "2026-11-30");
    expect(schedule?.validFrom).toBe("2026-11-30T05:00");
    expect(schedule?.validTo).toBe("2026-12-01T05:00");
    const values = withForecastSchedule("marine-forecast", {
      issuedAt: "2026-11-30T09:15",
    });
    expect(values.issuedAt).toBe("2026-11-30T05:00");
    expect(values.validTo).toBe("2026-12-01T05:00");
    expect(values.validity).toBe("05:00 today to 05:00 tomorrow");
  });

  it("offers only the synopsis for CAP text", () => {
    expect(capInsertTargets("marine-forecast")).toEqual([
      { label: "Synopsis", value: "synopsis" },
    ]);
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

  it("types only what the register does not compute for the month reviewed", () => {
    const keys = productFields("climate-bulletin").map((f) => f.key);
    // Rainfall and temperature figures for the month come from the eRegister
    // month summary. The looking-back observations are typed until #991.
    expect(keys.some((k) => TYPED_FIGURE.test(k))).toBe(false);
    for (const key of [
      "volume",
      "issue",
      "enso",
      "spi1",
      "spi12",
      "pet",
      "precipOutlook",
      "wetDaysMin",
      "tempMaxRangeMin",
      "droughtOutlook",
      "generalImplications",
      "impactAgriculture",
      "verifyRainfallObserved",
      "triviaQuestion",
    ])
      expect(keys).toContain(key);
    expect(keys).not.toContain("rainfallComment");
  });

  it("lists the SPI categories driest to wettest", () => {
    expect(SPI_CATEGORIES[0]).toBe("Exceptionally Dry");
    expect(SPI_CATEGORIES.indexOf("Normal")).toBe(5);
    expect(SPI_CATEGORIES.at(-1)).toBe("Exceptionally Wet");
    const spi = productFields("climate-bulletin").find((f) => f.key === "spi3");
    expect(spi?.options).toEqual(SPI_CATEGORIES);
  });

  it("makes only the 'from' end of the extreme-spell range optional", () => {
    const fields = productFields("climate-bulletin");
    const byKey = (key: string) => fields.find((f) => f.key === key);
    expect(byKey("extremeSpellsMin")?.required).toBeFalsy();
    expect(byKey("extremeSpellsMax")?.required).toBe(true);
    expect(byKey("wetDaysMin")?.required).toBe(true);
    expect(byKey("wetDaysMax")?.required).toBe(true);
  });

  it("keeps the layout-specific parts optional", () => {
    const fields = productFields("climate-bulletin");
    for (const key of ["heatStress", "extremeHeat", "generalImplications"])
      expect(fields.find((f) => f.key === key)?.required).toBeFalsy();
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
