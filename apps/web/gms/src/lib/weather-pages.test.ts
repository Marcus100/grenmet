import type {
  PublicForecast,
  PublicObservation,
  PublicPublishedProduct,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  unavailableWeather,
  weatherFromForecast,
} from "@/lib/forecast-selection";
import {
  hasIssuedForecast,
  latestSynopsis,
  stationReading,
  threeDayRows,
} from "@/lib/weather-pages";

function forecast(issuedDays: number): PublicForecast {
  return {
    as_of: "2026-09-14T10:00:00Z",
    timezone: "America/Grenada",
    base_date: "2026-09-14",
    observation: null,
    periods: Array.from({ length: 5 }, (_, index) => ({
      date: `2026-09-${14 + index}`,
      valid_from: "2026-09-14T10:00:00Z",
      valid_to: "2026-09-15T10:00:00Z",
      period_key: index ? `day${index}` : "",
      high: 31,
      low: 25,
      details: { summary: `Showers day ${index}` },
      conditions: [
        { icon: "wind", value: "16 mph", label: "Wind speed (14 kt)" },
        { icon: "compass", value: "ENE", label: "Wind direction" },
        { icon: "umbrella", value: "40%", label: "Chance of rain" },
      ],
      source:
        index < issuedDays
          ? {
              product_id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
              revision: 1,
              kind: "morning" as const,
              issued_at: "2026-09-14T10:00:00Z",
              published_at: "2026-09-14T10:00:00Z",
            }
          : null,
    })),
  };
}

describe("3-day rows", () => {
  it("maps API periods to table rows", () => {
    const rows = threeDayRows(weatherFromForecast(forecast(5)).days);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual([
      "Today",
      "Showers day 0",
      "31 °C",
      "25 °C",
      "16 mph ENE",
      "40%",
    ]);
    expect(rows[1]?.[0]).toBe("Tomorrow");
    expect(rows[2]?.[0]).toContain("16");
  });

  it("says so when a day has no published forecast", () => {
    const days = weatherFromForecast(forecast(1)).days;
    expect(hasIssuedForecast(days)).toBe(true);
    expect(threeDayRows(days)[2]?.[1]).toBe("No published forecast yet");
  });

  it("reports nothing issued for an empty or unavailable feed", () => {
    expect(hasIssuedForecast(weatherFromForecast(forecast(0)).days)).toBe(
      false
    );
    expect(hasIssuedForecast(unavailableWeather().days)).toBe(false);
    expect(threeDayRows([])).toEqual([]);
  });
});

const observation: PublicObservation = {
  station_id: "mbia",
  station_name: null,
  observed_at: "2026-09-14T20:00:00Z",
  status: "accepted",
  temperature_c: 28.4,
  dew_point_c: 24,
  relative_humidity: 78,
  wind_calm: false,
  wind_direction: "ENE",
  wind_speed_kt: 12,
  wind_speed_mph: 14,
  msl_pressure_hpa: 1013.2,
  pressure_trend: "steady",
  rain_mm: 2.4,
  rain_period_hours: 1,
  rain_24h_mm: 6,
} as PublicObservation;

describe("station reading", () => {
  it("returns null with no observation", () => {
    expect(stationReading(null)).toBeNull();
    expect(stationReading(undefined)).toBeNull();
  });

  it("labels the MBIA station and maps readings", () => {
    const reading = stationReading(
      observation,
      new Date("2026-09-14T20:30:00Z")
    );
    expect(reading?.stationName).toContain("MBIA");
    expect(reading?.observedAt).toBe("Reported 16:00 AST");
    expect(reading?.provisional).toBe(false);
    expect(reading?.tiles.map((t) => t.label)).toEqual([
      "Temperature",
      "Wind",
      "Humidity",
      "Pressure",
      "Rain, 24 h",
    ]);
    expect(reading?.tiles[0]?.value).toBe("28.4 °C");
    expect(reading?.rows[0]).toContain("1013.2 hPa");
  });

  it("marks a stale or provisional reading", () => {
    const reading = stationReading(
      { ...observation, status: "provisional" } as PublicObservation,
      new Date("2026-09-15T04:00:00Z")
    );
    expect(reading?.observedAt).toBe("Last observed 16:00 AST");
    expect(reading?.provisional).toBe(true);
  });

  it("drops readings the station did not supply", () => {
    const reading = stationReading({
      ...observation,
      temperature_c: null,
      relative_humidity: null,
      msl_pressure_hpa: null,
      rain_mm: null,
      rain_24h_mm: null,
    } as PublicObservation);
    expect(reading?.tiles.map((t) => t.label)).toEqual(["Wind"]);
  });
});

function product(
  kind: PublicPublishedProduct["kind"],
  publishedAt: string,
  values: Record<string, string>
): PublicPublishedProduct {
  return {
    id: `${kind}-${publishedAt}`,
    kind,
    publishedAt,
    revision: 1,
    values,
  };
}

describe("latest synopsis", () => {
  it("uses the newest forecast narrative and its watch items", () => {
    const result = latestSynopsis([
      product("morning", "2026-09-14T10:00:00Z", { summary: "Old." }),
      product("marine", "2026-09-14T13:00:00Z", { summary: "Not a forecast." }),
      product("midday", "2026-09-14T16:00:00Z", {
        summary: "A tropical wave.\n\nShowers.",
        issuedAt: "2026-09-14T12:00",
        windAlert: "Gusty winds",
        response: "Take care",
      }),
    ]);
    expect(result?.kindLabel).toBe("Midday Forecast");
    expect(result?.paragraphs).toEqual(["A tropical wave.", "Showers."]);
    expect(result?.watch).toEqual(["Gusty winds", "Take care"]);
  });

  it("lists the imported alerts and CAP warnings, not typed impacts", () => {
    const advisories = JSON.stringify({
      complete: true,
      items: [
        {
          source: "CAP",
          title: "Small Craft Advisory",
          impacts: "Choppy seas for small craft.",
        },
        { source: "Bulletin", title: "Dust haze", impacts: "" },
      ],
    });
    const result = latestSynopsis([
      product("morning", "2026-09-14T10:00:00Z", {
        summary: "Fair.",
        advisories,
        windAlert: "Typed before the change",
      }),
    ]);
    expect(result?.watch).toEqual([
      "Small Craft Advisory: Choppy seas for small craft.",
      "Dust haze",
    ]);
  });

  it("shows nothing to watch when no alerts were in force", () => {
    const result = latestSynopsis([
      product("evening", "2026-09-14T22:00:00Z", {
        summary: "Clear.",
        advisories: JSON.stringify({ complete: true, items: [] }),
      }),
    ]);
    expect(result?.watch).toEqual([]);
  });

  it("returns null when no forecast carries a summary", () => {
    expect(latestSynopsis([])).toBeNull();
    expect(
      latestSynopsis([product("morning", "2026-09-14T10:00:00Z", {})])
    ).toBeNull();
  });
});
