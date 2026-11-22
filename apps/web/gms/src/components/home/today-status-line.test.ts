import { describe, expect, it } from "vitest";
import { todayStatusLine } from "@/components/home/sky-hero";
import type { ForecastDayData } from "@/lib/forecast-data";
import { UNAVAILABLE_SOURCE } from "@/lib/forecast-selection";

const issuedToday: ForecastDayData = {
  condition: "partly-cloudy",
  conditions: [{ label: "Max Temp", value: "31°C" }],
  date: "2026-11-22",
  high: 31,
  low: 24,
  source: "",
  summary: "Partly cloudy.",
  title: "Forecast",
};

const notIssuedToday: ForecastDayData = {
  condition: "cloudy",
  conditions: [],
  date: "2026-11-22",
  high: null,
  low: null,
  source: "Awaiting publication",
  summary: "Awaiting today’s morning forecast",
  title: "Awaiting today’s morning forecast",
};

describe("todayStatusLine", () => {
  it("says nothing when today's forecast is issued", () => {
    expect(
      todayStatusLine({ days: [issuedToday], lastIssuedAt: null })
    ).toBeNull();
  });

  it("says today's forecast is not issued yet, with the last issue time", () => {
    expect(
      todayStatusLine({
        days: [notIssuedToday],
        lastIssuedAt: "2026-11-21T22:00:00Z",
      })
    ).toBe(
      "Today’s forecast has not been issued yet. Last issued: 21 Nov, 6:00 p.m. AST"
    );
  });

  it("says the last issue time is not known when none can be read", () => {
    expect(
      todayStatusLine({ days: [notIssuedToday], lastIssuedAt: null })
    ).toBe("Today’s forecast has not been issued yet. Last issued: not known");
  });

  it("says the feed is down rather than the forecast being unissued", () => {
    expect(
      todayStatusLine({
        days: [{ ...notIssuedToday, source: UNAVAILABLE_SOURCE }],
        lastIssuedAt: null,
      })
    ).toBe("Today’s forecast cannot be retrieved right now.");
  });
});
