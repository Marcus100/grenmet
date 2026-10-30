// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DAY_CONDITIONS,
  DAY_FORECASTS,
  type DayForecast,
  REFERENCE_DATE,
} from "@/lib/forecast-data";
import {
  forecastDayTitle,
  getForecastDays,
  segmentsToSlug,
  slugToSegments,
} from "@/lib/forecast-days";

const BASE = "2026-10-23";
const FIVE_DAYS: DayForecast[] = Array.from({ length: 5 }, () => ({
  condition: "sunny",
  high: 30,
  low: 24,
}));

describe("forecastDayTitle", () => {
  it("does not title an impossible date as a later real one", () => {
    expect(forecastDayTitle("2026-02-31")).toBe("Forecast");
  });

  it("names the day in full, in Grenada's calendar", () => {
    expect(forecastDayTitle("2026-10-23")).toBe(
      "Forecast for Friday, 23 October 2026"
    );
    expect(forecastDayTitle("not-a-date")).toBe("Forecast");
  });
});

/** Hoisted: a regex literal rebuilt on every call is a needless allocation. */
const DATED_PATH = /^\/weather\/\d{4}\/\d{2}\/\d{2}$/;
const SLUG_SEPARATOR = /-/g;

describe("getForecastDays", () => {
  it("starts on the base date it is given, not a sample date", () => {
    expect(getForecastDays(BASE, FIVE_DAYS)[0]?.slug).toBe(BASE);
    expect(getForecastDays(BASE, FIVE_DAYS)[0]?.slug).not.toBe(REFERENCE_DATE);
  });

  it("uses the forecasts it is given, never sample figures", () => {
    const warm: DayForecast[] = FIVE_DAYS.map((day) => ({ ...day, high: 33 }));
    for (const day of getForecastDays(BASE, warm)) {
      expect(day.high).toBe(33);
    }
  });

  it("returns five days, today first", () => {
    const days = getForecastDays(BASE, FIVE_DAYS);
    expect(days).toHaveLength(5);
    expect(days[0]?.isToday).toBe(true);
    expect(days.slice(1).every((d) => !d.isToday)).toBe(true);
  });

  it("builds a /weather/YYYY/MM/DD path for every day", () => {
    for (const day of getForecastDays(BASE, FIVE_DAYS)) {
      expect(day.path).toMatch(DATED_PATH);
    }
  });

  it("keeps path and slug describing the same date", () => {
    for (const day of getForecastDays(BASE, FIVE_DAYS)) {
      expect(day.path).toBe(
        `/weather/${day.slug.replace(SLUG_SEPARATOR, "/")}`
      );
    }
  });

  it("advances one calendar day at a time", () => {
    const slugs = getForecastDays(BASE, FIVE_DAYS).map((d) =>
      Date.parse(d.slug)
    );
    for (let i = 1; i < slugs.length; i++) {
      expect((slugs[i] ?? Number.NaN) - (slugs[i - 1] ?? Number.NaN)).toBe(
        86_400_000
      );
    }
  });
});

describe("slug and segment conversion", () => {
  it("round-trips a slug through its route segments", () => {
    const { year, month, day } = slugToSegments("2026-09-07");
    expect({ year, month, day }).toEqual({
      year: "2026",
      month: "09",
      day: "07",
    });
    expect(segmentsToSlug(year, month, day)).toBe("2026-09-07");
  });

  it("round-trips every day the nav offers", () => {
    for (const day of getForecastDays(BASE, FIVE_DAYS)) {
      const { year, month, day: d } = slugToSegments(day.slug);
      expect(segmentsToSlug(year, month, d)).toBe(day.slug);
    }
  });
});

describe("DAY_CONDITIONS", () => {
  it("has one entry per tab in the date strip", () => {
    // The strip rolls forward daily; a mismatch here means a tab renders
    // notFound(), which is exactly the bug the date-keyed map used to cause.
    expect(DAY_CONDITIONS).toHaveLength(
      getForecastDays(REFERENCE_DATE, DAY_FORECASTS).length
    );
  });

  it("gives every tab a non-empty set of conditions", () => {
    for (const conditions of DAY_CONDITIONS) {
      expect(conditions.length).toBeGreaterThan(0);
      for (const condition of conditions) {
        expect(condition.label.length).toBeGreaterThan(0);
        expect(condition.value.length).toBeGreaterThan(0);
      }
    }
  });
});
