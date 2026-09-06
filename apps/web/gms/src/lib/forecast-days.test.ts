// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY_CONDITIONS } from "@/lib/forecast-data";
import {
  getForecastDays,
  getUpcomingDaySlugs,
  segmentsToSlug,
  slugToSegments,
} from "@/lib/forecast-days";

/** Hoisted: a regex literal rebuilt on every call is a needless allocation. */
const DATED_PATH = /^\/forecasts\/\d{4}\/\d{2}\/\d{2}$/;
const SLUG_SEPARATOR = /-/g;

describe("getForecastDays", () => {
  it("returns five days, today first", () => {
    const days = getForecastDays();
    expect(days).toHaveLength(5);
    expect(days[0].isToday).toBe(true);
    expect(days.slice(1).every((d) => !d.isToday)).toBe(true);
  });

  it("builds a /forecasts/YYYY/MM/DD path for every day", () => {
    for (const day of getForecastDays()) {
      expect(day.path).toMatch(DATED_PATH);
    }
  });

  it("keeps path and slug describing the same date", () => {
    for (const day of getForecastDays()) {
      expect(day.path).toBe(
        `/forecasts/${day.slug.replace(SLUG_SEPARATOR, "/")}`
      );
    }
  });

  it("advances one calendar day at a time", () => {
    const slugs = getForecastDays().map((d) => Date.parse(d.slug));
    for (let i = 1; i < slugs.length; i++) {
      expect(slugs[i] - slugs[i - 1]).toBe(86_400_000);
    }
  });
});

describe("getUpcomingDaySlugs", () => {
  it("excludes today", () => {
    const days = getForecastDays();
    expect(getUpcomingDaySlugs()).toEqual(days.slice(1).map((d) => d.slug));
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
    for (const day of getForecastDays()) {
      const { year, month, day: d } = slugToSegments(day.slug);
      expect(segmentsToSlug(year, month, d)).toBe(day.slug);
    }
  });
});

describe("DAY_CONDITIONS", () => {
  it("has one entry per tab in the date strip", () => {
    // The strip rolls forward daily; a mismatch here means a tab renders
    // notFound(), which is exactly the bug the date-keyed map used to cause.
    expect(DAY_CONDITIONS).toHaveLength(getForecastDays().length);
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
