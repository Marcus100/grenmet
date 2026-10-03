import type { PublicObservation } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkyHero } from "@/components/home/sky-hero";
import { currentConditions } from "@/lib/current-conditions";
import type { ForecastDayData, WeatherSnapshot } from "@/lib/forecast-data";
import { REFERENCE_WEATHER } from "@/lib/forecast-data";
import { unavailableWeather } from "@/lib/forecast-selection";
import { dayReadings, nowReadings, rainChance } from "@/lib/hero-readings";
import { SAMPLE_DAYS, SAMPLE_NOW } from "@/lib/hero-samples";

const FEELS_LIKE = /^Feels like \d+°$/;
const OBSERVED_CHIP = /^Observed/;
const RAIN_LABEL = /% rain/;
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
const nowCard = () =>
  screen.getByRole("region", { name: "Current conditions" });
const panel = () => screen.getByRole("region", { name: "Forecast details" });

describe("Now card", () => {
  it("shows the register reading with feels-like and no provenance chip", () => {
    render(<SkyHero now={at("2026-09-29T17:12:00Z")} weather={weather()} />);
    const card = nowCard();
    expect(within(card).getByText(numeral("31°C"))).toBeInTheDocument();
    expect(within(card).getByText("Light shower")).toBeInTheDocument();
    expect(within(card).getByText(FEELS_LIKE)).toBeInTheDocument();
    expect(within(card).getByText("ENE 16 mph")).toBeInTheDocument();
    expect(within(card).queryByText("14 kt")).not.toBeInTheDocument();
    expect(within(card).queryByText(OBSERVED_CHIP)).not.toBeInTheDocument();
    expect(within(card).getByText("More readings (4)")).toBeInTheDocument();
  });

  it("says when an old reading was taken", () => {
    render(<SkyHero now={at("2026-09-29T21:00:00Z")} weather={weather()} />);
    expect(within(nowCard()).getByText("Last observed 13:00")).toBeVisible();
  });

  it("falls back to the midday product temperature, labelled as such", () => {
    render(<SkyHero weather={weather({ current: null })} />);
    expect(within(nowCard()).getByText("Midday reading")).toBeInTheDocument();
    expect(within(nowCard()).getByText(numeral("32°C"))).toBeInTheDocument();
    expect(within(nowCard()).queryByRole("term")).not.toBeInTheDocument();
  });
});

describe("Day tabs", () => {
  it("links five days and marks today when nothing else is selected", () => {
    render(<SkyHero weather={weather()} />);
    const tabs = within(
      screen.getByRole("navigation", { name: "Forecast days" })
    ).getAllByRole("link");
    expect(tabs).toHaveLength(5);
    expect(tabs[0]).toHaveAttribute("aria-current", "page");
    expect(tabs[0]).toHaveAttribute("href", "/");
    expect(tabs[1]).toHaveAttribute("href", "/weather/2026/09/09");
    expect(tabs[0]).toHaveTextContent("20% rain");
  });

  it("shows the selected day's forecast in the panel", () => {
    render(<SkyHero selected="2026-09-09" weather={weather()} />);
    const tabs = within(
      screen.getByRole("navigation", { name: "Forecast days" })
    ).getAllByRole("link");
    expect(tabs[1]).toHaveAttribute("aria-current", "page");
    expect(tabs[0]).not.toHaveAttribute("aria-current");
    expect(
      within(panel()).getByText(REFERENCE_WEATHER.days[1].summary)
    ).toBeInTheDocument();
  });
});

describe("Day panel", () => {
  it("leads with the periods and words, then the reading rows", () => {
    render(<SkyHero weather={weather()} />);
    expect(within(panel()).getByText("Midday words")).toBeInTheDocument();
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(panel())
        .getAllByRole("term")
        .map((term) => term.textContent)
    ).toEqual([
      "Chance of rain",
      "Wind",
      "Gusts",
      "Seas, moderate",
      "High tide",
      "Low tide",
      "Sunrise",
      "Sunset",
    ]);
  });

  it("shows only the feed's words for a day with nothing issued", () => {
    render(<SkyHero weather={unavailableWeather()} />);
    expect(within(panel()).getByText("Forecast unavailable")).toBeVisible();
    expect(within(panel()).queryByRole("term")).not.toBeInTheDocument();
    expect(screen.queryByText(RAIN_LABEL)).not.toBeInTheDocument();
  });
});

describe("hero readings", () => {
  it("prefers issued values and keeps one tide of each kind", () => {
    const values = Object.fromEntries(
      dayReadings(issued(), 0).map((row) => [row.label, row.value])
    );
    expect(values).toMatchObject({
      "Chance of rain": "20%",
      Wind: "ENE 12–25 mph",
      Gusts: "35 mph",
      "Seas, moderate": "1.5–2.0 m",
      "High tide": "04:12",
      "Low tide": "10:20",
      Sunrise: "05:58",
    });
  });

  it("fills gaps in an issued day from the samples", () => {
    const day = issued({ conditions: [{ label: "Wind", value: "E 10 mph" }] });
    const values = Object.fromEntries(
      dayReadings(day, 2).map((row) => [row.label, row.value])
    );
    expect(values["Chance of rain"]).toBe(`${SAMPLE_DAYS[2].rainChance}%`);
    expect(values.Gusts).toBe(SAMPLE_DAYS[2].gusts);
    expect(values["High tide"]).toBe(SAMPLE_DAYS[2].highTide);
  });

  it("never invents a forecast for an outage", () => {
    const outage = unavailableWeather().days[0];
    expect(dayReadings(outage, 0)).toEqual([]);
    expect(rainChance(outage, 0)).toBeNull();
  });

  it("puts wind, humidity, rain and air quality first on the Now card", () => {
    const { extra, primary } = nowReadings(currentConditions(reading));
    expect(primary.map((row) => row.label)).toEqual([
      "Wind",
      "Humidity",
      "Rain, last 3 h",
      "Air quality",
    ]);
    expect(primary[3].value).toBe(`${SAMPLE_NOW.airQuality.index} AQI`);
    expect(extra.map((row) => row.label)).toEqual([
      "Gusts",
      "Dew point",
      "Pressure",
      "Visibility",
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
