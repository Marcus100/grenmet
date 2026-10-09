import type { PublicObservation } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkyHero } from "@/components/home/sky-hero";
import { currentConditions } from "@/lib/current-conditions";
import type { ForecastDayData, WeatherSnapshot } from "@/lib/forecast-data";
import { REFERENCE_WEATHER } from "@/lib/forecast-data";
import { unavailableWeather } from "@/lib/forecast-selection";
import {
  dayReadings,
  nowReadings,
  rainChance,
  skyFromWords,
} from "@/lib/hero-readings";
import { SAMPLE_DAYS, SAMPLE_NOW } from "@/lib/hero-samples";

const FEELS_LIKE = /^Feels like \d+°$/;
const CHANCE_OF_RAIN = /chance of rain/;
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

/** An issued day in the FastAPI condition vocabulary. */
function issued(overrides: Partial<ForecastDayData> = {}): ForecastDayData {
  return {
    ...REFERENCE_WEATHER.days[0],
    source: "",
    summary: "Midday words",
    high: 32,
    low: 26,
    conditions: [
      { label: "Max temp", value: "32°C" },
      { label: "Wind speed (10–22 kt)", value: "12–25 mph" },
      { label: "Wind direction", value: "ENE" },
      { label: "Gusts (30 kt)", value: "35 mph" },
      { label: "Chance of rain", value: "20%" },
      { label: "Sea state", value: "Moderate" },
      { label: "Wave height (5–7 ft)", value: "1.5–2.0 m" },
      { label: "Swell · NE every 9 s", value: "1.4 m" },
      { label: "High tide (0.6 m)", value: "04:12" },
      { label: "High tide (0.5 m)", value: "16:30" },
      { label: "Low tide", value: "10:20" },
      { label: "Sunrise", value: "05:58" },
      { label: "Sunset", value: "18:02" },
    ],
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    ...REFERENCE_WEATHER,
    current: currentConditions(reading),
    days: [issued(), ...REFERENCE_WEATHER.days.slice(1)],
    todayIssues: [],
    label: "",
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);
/** The big numeral reads "31°C" to screen readers. */
const numeral = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === "P" && element.textContent === text;
const tabs = () =>
  within(
    screen.getByRole("navigation", { name: "Forecast days" })
  ).getAllByRole("link");
const nowPanel = () =>
  screen.getByRole("region", { name: "Current conditions" });
const panel = () => screen.getByRole("region", { name: "Forecast details" });
const terms = (region: HTMLElement) =>
  within(region)
    .getAllByRole("term")
    .map((term) => term.textContent);

describe("Now", () => {
  it("is selected by default and shows the register reading", () => {
    render(<SkyHero now={at("2026-09-29T17:12:00Z")} weather={weather()} />);
    expect(screen.getAllByText(numeral("31°C")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Light shower").length).toBeGreaterThan(0);
    expect(screen.getAllByText(FEELS_LIKE).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Observed 13:00 · MBIA").length).toBeGreaterThan(
      0
    );
    expect(
      screen
        .getAllByRole("link", { current: "page" })
        .every((link) => link.getAttribute("href") === "/")
    ).toBe(true);
    expect(within(nowPanel()).getByText("ENE 16 mph")).toBeInTheDocument();
    expect(within(nowPanel()).queryByText("14 kt")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Forecast details" })
    ).not.toBeInTheDocument();
  });

  it("lists every reading in pairs, ending with air quality", () => {
    render(<SkyHero weather={weather()} />);
    expect(terms(nowPanel())).toEqual([
      "Wind",
      "Gusts",
      "Humidity",
      "Dew point",
      "Pressure",
      "Visibility",
      "Cloud cover",
      "UV index",
      "Rain",
      "Air quality",
    ]);
    expect(within(nowPanel()).getByText(", rising")).toBeInTheDocument();
    expect(within(nowPanel()).getByText("Mostly cloudy")).toBeInTheDocument();
  });

  it("says when an old reading was taken", () => {
    render(<SkyHero now={at("2026-09-29T21:00:00Z")} weather={weather()} />);
    expect(
      screen.getAllByText("Last observed 13:00 · MBIA").length
    ).toBeGreaterThan(0);
  });

  it("falls back to the midday product temperature, labelled as such", () => {
    render(<SkyHero weather={weather({ current: null })} />);
    expect(screen.getAllByText("Midday reading · MBIA").length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText(numeral("32°C")).length).toBeGreaterThan(0);
    expect(within(nowPanel()).queryByRole("term")).not.toBeInTheDocument();
  });
});

describe("Day tabs", () => {
  it("links each day to its dated route, today included", () => {
    render(<SkyHero weather={weather()} />);
    const links = tabs();
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveTextContent("Now");
    expect(links[1]).toHaveAttribute("href", "/weather/2026/09/08");
    expect(links[1]).toHaveTextContent("Tue");
    expect(links[1]).toHaveTextContent("20% chance of rain");
    expect(links[2]).toHaveAttribute("href", "/weather/2026/09/09");
  });

  it("shows the selected day's forecast instead of the readings", () => {
    render(<SkyHero selected="2026-09-09" weather={weather()} />);
    expect(tabs()[2]).toHaveAttribute("aria-current", "page");
    expect(tabs()[0]).not.toHaveAttribute("aria-current");
    expect(
      within(panel()).getByText(REFERENCE_WEATHER.days[1].summary)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Current conditions" })
    ).not.toBeInTheDocument();
  });

  it("selects today's forecast for `today`", () => {
    render(<SkyHero selected="today" weather={weather()} />);
    expect(tabs()[1]).toHaveAttribute("aria-current", "page");
    expect(within(panel()).getByText("Midday words")).toBeInTheDocument();
  });

  it("falls back to Now for a date outside the five days", () => {
    render(<SkyHero selected="2026-12-25" weather={weather()} />);
    expect(nowPanel()).toBeInTheDocument();
  });
});

describe("Day panel", () => {
  it("leads with the words, then the forecast items in pairs", () => {
    render(<SkyHero selected="today" weather={weather()} />);
    expect(within(panel()).getByText("Midday words")).toBeInTheDocument();
    expect(terms(panel())).toEqual([
      "Wind",
      "Gusts",
      "Chance of rain",
      "Rainfall",
      "Humidity",
      "Cloud cover",
      "Seas",
      "Swell",
      "Sunrise",
      "Sunset",
      "High tides",
      "Low tides",
      "Visibility",
      "Air quality",
    ]);
    expect(within(panel()).queryByText("Feels like")).not.toBeInTheDocument();
    expect(within(panel()).queryByText("UV index")).not.toBeInTheDocument();
  });

  it("shows only the feed's words for a day with nothing issued", () => {
    render(<SkyHero selected="today" weather={unavailableWeather()} />);
    expect(within(panel()).getByText("Forecast unavailable")).toBeVisible();
    expect(within(panel()).queryByRole("term")).not.toBeInTheDocument();
    expect(screen.queryByText(CHANCE_OF_RAIN)).not.toBeInTheDocument();
  });
});

describe("hero readings", () => {
  it("prefers issued values and keeps every tide time", () => {
    const rows = dayReadings(issued(), 0);
    const values = Object.fromEntries(
      rows.map((row) => [row.label, row.value])
    );
    expect(values).toMatchObject({
      "Chance of rain": "20%",
      Wind: "ENE 12–25 mph",
      Gusts: "35 mph",
      Seas: "1.5–2.0 m",
      "High tides": "04:12 · 16:30",
      "Low tides": "10:20",
      Sunrise: "05:58",
    });
    expect(rows.find((row) => row.label === "Seas")?.detail).toBe("Moderate");
    expect(rows.find((row) => row.label === "Swell")).toMatchObject({
      detail: "NE every 9 s",
      value: "1.4 m",
    });
  });

  it("fills gaps in an issued day from the samples", () => {
    const day = issued({ conditions: [{ label: "Wind", value: "E 10 mph" }] });
    const values = Object.fromEntries(
      dayReadings(day, 2).map((row) => [row.label, row.value])
    );
    expect(values["Chance of rain"]).toBe(`${SAMPLE_DAYS[2].rainChance}%`);
    expect(values.Gusts).toBe(SAMPLE_DAYS[2].gusts);
    expect(values["High tides"]).toBe(SAMPLE_DAYS[2].highTides);
    expect(values.Rainfall).toBe(SAMPLE_DAYS[2].rainfall);
  });

  it("never invents a forecast for an outage", () => {
    const outage = unavailableWeather().days[0];
    expect(dayReadings(outage, 0)).toEqual([]);
    expect(rainChance(outage, 0)).toBeNull();
  });

  it("takes register values first and samples only for gaps", () => {
    const rows = nowReadings(currentConditions(reading));
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel.Pressure).toMatchObject({
      trend: "rising",
      value: "1014.2 hPa",
    });
    expect(byLabel.Rain.value).toBe("0.4 mm");
    expect(byLabel["UV index"].value).toBe(SAMPLE_NOW.uvIndex);
    expect(byLabel["Air quality"]).toMatchObject({
      tag: SAMPLE_NOW.airQuality.level,
      value: `${SAMPLE_NOW.airQuality.index} AQI`,
    });
  });

  it.each([
    ["Light shower", "showers"],
    ["Sunny intervals", "partly-cloudy"],
    ["Fair", "sunny"],
    ["Mostly cloudy", "cloudy"],
    [null, "cloudy"],
  ] as const)("draws %s as %s", (words, sky) => {
    expect(skyFromWords(words)).toBe(sky);
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
