import { describe, expect, it } from "vitest";
import { DAY_FORECASTS } from "@/lib/forecast-data";
import { getForecastDays, getUpcomingDaySlugs } from "@/lib/forecast-days";

describe("getForecastDays", () => {
  it("returns 5 days starting with today", () => {
    const days = getForecastDays();
    expect(days).toHaveLength(5);
    expect(days[0]?.isToday).toBe(true);
    expect(days.slice(1).every((d) => !d.isToday)).toBe(true);
  });

  it("attaches the mock condition and high/low for each day, in order", () => {
    const days = getForecastDays();
    days.forEach((day, i) => {
      expect(day.condition).toBe(DAY_FORECASTS[i]?.condition);
      expect(day.high).toBe(DAY_FORECASTS[i]?.high);
      expect(day.low).toBe(DAY_FORECASTS[i]?.low);
    });
  });
});

describe("getUpcomingDaySlugs", () => {
  it("excludes today, leaving the other 4 days", () => {
    const slugs = getUpcomingDaySlugs();
    const days = getForecastDays();
    expect(slugs).toHaveLength(4);
    expect(slugs).not.toContain(days[0]?.slug);
  });
});
