import type { PublicForecast } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { unavailableWeather, weatherFromForecast } from "./forecast-selection";

function selection(): PublicForecast {
  return {
    as_of: "2026-09-14T22:00:00Z",
    timezone: "America/Grenada",
    base_date: "2026-09-14",
    observation: null,
    periods: Array.from({ length: 5 }, (_, index) => ({
      date: `2026-09-${14 + index}`,
      valid_from: "2026-09-14T22:00:00Z",
      valid_to: "2026-09-15T11:00:00Z",
      source: {
        product_id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
        revision: 2,
        kind: "evening",
        issued_at: "2026-09-14T22:00:00Z",
        published_at: "2026-09-14T22:00:00Z",
      },
      period_key: index ? `day${index}` : "",
      high: index ? 32 : null,
      low: 25,
      details: {
        summary: "LOCAL TEST — Fair",
        wind: "ENE",
        seaState: "Moderate",
        highTides: "09:15",
        word: "Cloudy",
        definition: "Cloud cover",
      },
    })),
  };
}
describe("forecast presentation", () => {
  it("renders backend-selected dates and values without reselecting against the browser clock", () => {
    const result = weatherFromForecast(selection());
    expect(result.baseDate).toBe("2026-09-14");
    expect(result.days[0].title).toBe("Tonight");
    expect(result.days[0].high).toBeNull();
    expect(result.days[0].summary).toBe("LOCAL TEST — Fair");
    expect(result.days[0].condition).toBe("sunny");
    expect(result.days[0].conditions).toContainEqual({
      label: "High Tide",
      value: "09:15",
    });
    expect(result.days[0].conditions).not.toContainEqual({
      label: "Word of the day",
      value: "Cloudy",
    });
    expect(result.days[4].date).toBe("2026-09-18");
    expect(result.days[4].high).toBe(32);
  });
  it("distinguishes missing publication from a service outage", () => {
    const data = selection();
    data.periods[0].source = null;
    const result = weatherFromForecast(data);
    expect(result.days[0].title).toBe("Awaiting today’s morning forecast");
    const outage = unavailableWeather();
    expect(outage.days).toHaveLength(5);
    expect(
      outage.days.every((day) => day.high === null && day.low === null)
    ).toBe(true);
    expect(outage.label).toContain("cannot be retrieved");
  });
  it("formats the report time without labelling it a measured observation time", () => {
    const data = selection();
    const source = data.periods[0].source;
    if (!source) throw new Error("Fixture source missing");
    data.observation = {
      temperature: 25.9,
      source,
      time_basis: "product_issue",
    };
    const result = weatherFromForecast(data);
    expect(result.observation?.temperature).toBe(25.9);
    expect(result.observation?.observedAt).toContain("Reported");
  });
});

describe("structured conditions from the forecast feed", () => {
  it("uses the feed's formatted tiles and icon names", () => {
    const forecast = selection();
    forecast.periods[0].conditions = [
      { icon: "wind", value: "12–23 mph", label: "Wind speed (10–20 kt)" },
      { icon: "arrow-up-to-line", value: "05:50", label: "High tide (0.6 m)" },
    ];
    const [today] = weatherFromForecast(forecast).days;
    expect(today.conditions).toEqual([
      { icon: "wind", value: "12–23 mph", label: "Wind speed (10–20 kt)" },
      { icon: "arrow-up-to-line", value: "05:50", label: "High tide (0.6 m)" },
    ]);
  });
});
