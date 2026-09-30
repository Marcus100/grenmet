import type { PublicObservation } from "@barrelsgd/api-client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkyHero } from "@/components/home/sky-hero";
import { currentConditions } from "@/lib/current-conditions";
import type {
  ForecastDayData,
  TodayIssue,
  WeatherSnapshot,
} from "@/lib/forecast-data";
import { REFERENCE_WEATHER } from "@/lib/forecast-data";
import { forecastTiles } from "@/lib/today-tiles";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const HERO_NAME = /^Grenada weather/;
const OBSERVED_AT = "2026-09-29T17:00:00Z"; // 13:00 AST
const reading: PublicObservation = {
  station_id: "78958",
  observed_at: OBSERVED_AT,
  status: "provisional",
  temperature_c: 31.2,
  dew_point_c: 24,
  relative_humidity: 66,
  wind_calm: false,
  wind_direction: "ENE",
  wind_speed_kt: 14,
  wind_speed_mph: 16,
  msl_pressure_hpa: 1014.2,
  pressure_trend: "rising",
  pressure_change_hpa: 0.8,
  rain_mm: 0.4,
  rain_trace: false,
  rain_period_hours: 3,
  weather: "Light shower",
  cloud: "Mostly cloudy",
};

function day(summary: string, overrides: Partial<ForecastDayData> = {}) {
  return {
    ...REFERENCE_WEATHER.days[0],
    summary,
    high: 32,
    low: 26,
    conditions: [
      { label: "Max temp", value: "32°C" },
      { label: "Sunrise", value: "5:58" },
      { label: "Wind speed (10–22 kt)", value: "12–25 mph" },
      { label: "Chance of rain", value: "20%" },
      { label: "Sea state", value: "Slight" },
      { label: "Midday observation at MBIA", value: "32°C" },
    ],
    ...overrides,
  };
}

const issues: TodayIssue[] = [
  {
    kind: "morning",
    label: "Morning",
    issuedAt: "2026-09-29T11:00:00Z",
    day: day("Morning words"),
  },
  {
    kind: "midday",
    label: "Midday",
    issuedAt: "2026-09-29T16:00:00Z",
    day: day("Midday words"),
  },
];

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    ...REFERENCE_WEATHER,
    current: currentConditions(reading),
    todayIssues: issues,
    label: "",
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);
/** The big numeral reads "31°C" to screen readers. */
const numeral = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === "P" && element.textContent === text;

describe("Now panel", () => {
  it("shows the register reading with its time and provisional status", () => {
    render(<SkyHero now={at("2026-09-29T17:12:00Z")} weather={weather()} />);
    expect(
      screen.getByText("Observed 13:00 · provisional")
    ).toBeInTheDocument();
    expect(screen.getByText(numeral("31°C"))).toBeInTheDocument();
    expect(screen.getByText("Light shower")).toBeInTheDocument();
    expect(screen.getByText("ENE 16 mph")).toBeInTheDocument();
    expect(screen.getByText("14 kt")).toBeInTheDocument();
    expect(screen.getByText("Rising 0.8 in 3 h")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Now at MBIA" })).toBeVisible();
  });

  it("keeps an old reading but says when it was taken", () => {
    render(<SkyHero now={at("2026-09-29T21:00:00Z")} weather={weather()} />);
    expect(
      screen.getByText("Last observed 13:00 · provisional")
    ).toBeInTheDocument();
  });

  it("falls back to the midday product temperature, labelled as such", () => {
    render(<SkyHero weather={weather({ current: null })} />);
    expect(screen.getByText("Midday reading")).toBeInTheDocument();
    expect(screen.getByText(numeral("32°C"))).toBeInTheDocument();
  });
});

describe("Today panel", () => {
  it("selects the newest issue and keeps earlier issues one tap away", () => {
    render(<SkyHero weather={weather()} />);
    const midday = screen.getByRole("button", { name: "Midday" });
    expect(midday).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Midday words")).toBeInTheDocument();
    expect(screen.getByText("Forecast · Midday 12:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Morning" }));
    expect(screen.getByText("Morning words")).toBeInTheDocument();
    expect(screen.getByText("Forecast · Morning 07:00")).toBeInTheDocument();
  });

  it("shows no tabs for a single issue and no repeated awaiting text", () => {
    const awaiting = day("Awaiting today’s morning forecast", {
      title: "Awaiting today’s morning forecast",
      high: null,
      low: null,
      conditions: [],
    });
    render(
      <SkyHero
        weather={weather({
          todayIssues: [],
          days: [awaiting, ...REFERENCE_WEATHER.days.slice(1)],
          label: "Awaiting today’s morning forecast",
        })}
      />
    );
    const hero = screen.getByRole("region", { name: HERO_NAME });
    expect(within(hero).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(hero).getAllByText("Awaiting today’s morning forecast")
    ).toHaveLength(1);
  });
});

describe("forecastTiles", () => {
  it("leads with high/low, then rain, wind and sea, dropping duplicates", () => {
    expect(forecastTiles(day("x")).map((tile) => tile.label)).toEqual([
      "High / Low",
      "Chance of rain",
      "Wind speed (10–22 kt)",
      "Sea state",
      "Sunrise",
    ]);
  });
});

describe("currentConditions", () => {
  it("says calm and trace in words", () => {
    const result = currentConditions({
      ...reading,
      wind_calm: true,
      rain_trace: true,
      rain_mm: 0,
      status: "accepted",
    });
    expect(result.provisional).toBe(false);
    expect(result.primary.map((tile) => tile.value)).toContain("Calm");
    expect(result.primary.map((tile) => tile.value)).toContain("Trace");
  });

  it("drops readings the observer did not record", () => {
    const result = currentConditions({
      station_id: "78958",
      observed_at: OBSERVED_AT,
      status: "provisional",
      temperature_c: 30,
    });
    expect(result.primary).toEqual([]);
    expect(result.extra).toEqual([]);
  });
});
