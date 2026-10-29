import type {
  PublicForecast,
  PublicObservation,
  PublicPublishedProduct,
} from "@barrelsgd/api-client";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  unavailableWeather,
  weatherFromForecast,
} from "@/lib/forecast-selection";
import type { UnitSystem } from "@/lib/units";
import {
  hasIssuedForecast,
  latestSynopsis,
  stationReading,
  threeDayRows,
} from "@/lib/weather-pages";

/**
 * The text a table cell or tile shows in one unit system. Each figure renders
 * both systems with `data-units-only` (CSS picks one); this drops the other.
 */
function shownIn(node: ReactNode, system: UnitSystem): string {
  const other = system === "metric" ? "imperial" : "metric";
  const { container, unmount } = render(<span>{node}</span>);
  for (const element of container.querySelectorAll(
    `[data-units-only="${other}"]`
  )) {
    element.remove();
  }
  const text = container.textContent ?? "";
  unmount();
  return text;
}

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
        {
          icon: "wind",
          value: "16 mph",
          label: "Wind speed (14 kt)",
          quantity: "speed",
          low: 14,
          high: null,
        },
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
  it("maps API periods to table rows in the visitor's units", () => {
    const rows = threeDayRows(weatherFromForecast(forecast(5)).days);
    expect(rows).toHaveLength(3);
    const first = rows[0] ?? [];
    expect(first[0]).toBe("Today");
    expect(first[1]).toBe("Showers day 0");
    expect(first[5]).toBe("40%");
    expect(shownIn(first[2], "metric")).toBe("31°C");
    expect(shownIn(first[3], "metric")).toBe("25°C");
    expect(shownIn(first[2], "imperial")).toBe("88°F");
    expect(shownIn(first[3], "imperial")).toBe("77°F");
    // 14 knots is 26 km/h or 16 mph; the direction stays in front.
    expect(shownIn(first[4], "metric")).toBe("ENE 26 km/h");
    expect(shownIn(first[4], "imperial")).toBe("ENE 16 mph");
    expect(rows[1]?.[0]).toBe("Tomorrow");
    expect(shownIn(rows[2]?.[0], "metric")).toContain("16");
  });

  it("falls back to the feed's text for a wind tile with no numbers", () => {
    const days = weatherFromForecast(forecast(1)).days;
    const [day] = days;
    if (!day) throw new Error("expected a day");
    const plain = {
      ...day,
      conditions: [
        { label: "Wind speed (14 kt)", value: "16 mph" },
        { label: "Wind direction", value: "ENE" },
      ],
    };
    const [row] = threeDayRows([plain]);
    expect(shownIn(row?.[4], "metric")).toBe("ENE 16 mph");
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
    const [temperature, wind, , pressure, rain] = reading?.tiles ?? [];
    expect(shownIn(temperature?.value, "metric")).toBe("28.4°C");
    expect(shownIn(temperature?.value, "imperial")).toBe("83°F");
    expect(shownIn(temperature?.detail, "metric")).toBe("Dew point 24°C");
    expect(shownIn(wind?.value, "metric")).toBe("ENE 22 km/h");
    expect(shownIn(wind?.value, "imperial")).toBe("ENE 14 mph");
    expect(shownIn(pressure?.value, "metric")).toBe("1013.2 hPa");
    expect(shownIn(pressure?.value, "imperial")).toBe("29.92 inHg");
    expect(shownIn(rain?.value, "metric")).toBe("6 mm");
    expect(shownIn(rain?.value, "imperial")).toBe("0.24 in");
    expect(shownIn(reading?.rows[0]?.[5], "metric")).toBe("1013.2 hPa");
    expect(shownIn(reading?.rows[0]?.[4], "imperial")).toBe("ENE 14 mph");
  });

  it("shows the pressure change in the visitor's units", () => {
    const reading = stationReading(
      {
        ...observation,
        pressure_trend: "rising",
        pressure_change_hpa: 0.8,
      } as PublicObservation,
      new Date("2026-09-14T20:30:00Z")
    );
    const pressure = reading?.tiles.find((t) => t.label === "Pressure");
    expect(shownIn(pressure?.detail, "metric")).toBe("Rising 0.8 hPa in 3 h");
    expect(shownIn(pressure?.detail, "imperial")).toBe(
      "Rising 0.02 inHg in 3 h"
    );
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

  it("says alerts could not be confirmed when the capture was incomplete", () => {
    const result = latestSynopsis([
      product("evening", "2026-09-14T22:00:00Z", {
        summary: "Clear.",
        advisories: JSON.stringify({ complete: false, items: [] }),
      }),
    ]);
    expect(result?.watch).toEqual([
      "Weather alerts could not be fully confirmed when this forecast was issued.",
    ]);
  });

  it("returns null when no forecast carries a summary", () => {
    expect(latestSynopsis([])).toBeNull();
    expect(
      latestSynopsis([product("morning", "2026-09-14T10:00:00Z", {})])
    ).toBeNull();
  });
});
