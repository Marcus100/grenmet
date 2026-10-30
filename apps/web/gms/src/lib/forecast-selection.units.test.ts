import type { PublicForecast } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { weatherFromForecast } from "./forecast-selection";
import { bothUnits } from "./units";

// Today's period (index 0) is the one that carries the MBIA midday observation.
function forecastWithObservation(observed: string): PublicForecast {
  return {
    as_of: "2026-10-29T12:00:00Z",
    timezone: "America/Grenada",
    base_date: "2026-10-29",
    observation: null,
    periods: Array.from({ length: 2 }, (_, index) => ({
      date: `2026-10-${29 + index}`,
      valid_from: "2026-10-29T11:00:00Z",
      valid_to: "2026-10-30T11:00:00Z",
      source: {
        product_id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
        revision: 1,
        kind: "midday",
        issued_at: "2026-10-29T12:00:00Z",
        published_at: "2026-10-29T12:00:00Z",
      },
      period_key: index ? "day1" : "",
      high: index ? 30 : 32,
      low: 25,
      details: {
        summary: "Fair",
        wind: "ENE 12–22 mph",
        seaState: "Moderate",
        observedTemperature: observed,
      },
    })),
  };
}

function tile(label: string) {
  const [today] = weatherFromForecast(forecastWithObservation("31.9")).days;
  return today?.conditions.find((item) => item.label === label);
}

describe("fallback temperature tiles carry their numbers", () => {
  it("gives Max Temp and Min Temp a measure and keeps the metric text", () => {
    const max = tile("Max Temp");
    const min = tile("Min Temp");
    expect(max).toEqual({
      label: "Max Temp",
      measure: { quantity: "temperature", low: 32 },
      value: "32°C",
    });
    expect(min?.measure).toEqual({ quantity: "temperature", low: 25 });
    expect(max?.measure && bothUnits(max.measure)).toEqual({
      imperial: "90°F",
      metric: "32°C",
    });
  });

  it("gives the MBIA midday observation a measure, not a typed °C string", () => {
    const observed = tile("Midday observation at MBIA");
    expect(observed).toEqual({
      label: "Midday observation at MBIA",
      measure: { quantity: "temperature", low: 31.9 },
      value: "31.9°C",
    });
    expect(observed?.measure && bothUnits(observed.measure)).toEqual({
      imperial: "89°F",
      metric: "31.9°C",
    });
  });

  it("leaves out the observation when the feed sends no number for it", () => {
    const [today] = weatherFromForecast(
      forecastWithObservation("not a number")
    ).days;
    expect(
      today?.conditions.some(
        (item) => item.label === "Midday observation at MBIA"
      )
    ).toBe(false);
  });
});

describe("structured tiles keep the MBIA observation in the unit switch", () => {
  it("gives the observation a measure when the feed sends structured tiles", () => {
    const forecast = forecastWithObservation("31.9");
    const first = forecast.periods[0];
    if (!first) throw new Error("expected a forecast period");
    first.conditions = [
      {
        icon: "thermometer-sun",
        label: "Highest today",
        value: "32°C",
        quantity: "temperature",
        low: 32,
        high: null,
      },
    ];
    const [today] = weatherFromForecast(forecast).days;
    const observed = today?.conditions.find(
      (item) => item.label === "Midday observation at MBIA"
    );
    expect(observed).toEqual({
      label: "Midday observation at MBIA",
      measure: { quantity: "temperature", low: 31.9 },
      value: "31.9°C",
    });
  });
});
