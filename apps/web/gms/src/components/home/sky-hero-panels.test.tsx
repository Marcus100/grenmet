import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicObservation } from "@barrelsgd/api-client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const CLOCK = /^\d{1,2}:\d{2} [ap]\.m\.$/;
// en-GB abbreviates September as "Sept" on current ICU; match either.
const SAMPLE_REFERENCE = /hero-samples|SAMPLE_/;
const FEELS_LIKE = /^Feels like/;
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

function firstReferenceDay(): ForecastDayData {
  const day = REFERENCE_WEATHER.days[0];
  if (!day) {
    throw new Error("REFERENCE_WEATHER has no days");
  }
  return day;
}
const BASE_DAY = firstReferenceDay();

/** An issued day in the FastAPI condition vocabulary. */
function issued(overrides: Partial<ForecastDayData> = {}): ForecastDayData {
  return {
    ...BASE_DAY,
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
const tabs = () =>
  within(
    screen.getByRole("navigation", { name: "Forecast days" })
  ).getAllByRole("link");
const nowPanel = () =>
  screen.getByRole("region", { name: "Current conditions" });
const panel = () => screen.getByRole("region", { name: "Forecast details" });
/** The visible summary card above the tabs. */
const card = () => screen.getByRole("region", { name: "Weather summary" });
const LAST_OBSERVED = /^Last observed 1:00 p\.m\. · MBIA$/;
const LAST_OBSERVED_OTHER_DAY = /^Last observed 29 Sept?, 1:00 p\.m\. · MBIA$/;
const TODAY_LINK = /^Today's forecast/;
const terms = (region: HTMLElement) =>
  within(region)
    .getAllByRole("term")
    .map((term) => term.textContent);

describe("Now", () => {
  it("is selected by default and shows what is measured at the station", () => {
    render(<SkyHero now={at("2026-09-29T17:12:00Z")} weather={weather()} />);
    expect(within(card()).getByText("Now · MBIA")).toBeInTheDocument();
    expect(within(card()).getByText("Light shower")).toBeInTheDocument();
    expect(within(card()).getByText(FEELS_LIKE)).toBeInTheDocument();
    expect(card()).toHaveTextContent("ENE 26 km/h");
    expect(tabs()[0]).toHaveAttribute("aria-current", "page");
    expect(nowPanel()).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Forecast details" })
    ).not.toBeInTheDocument();
  });

  it("links to today's forecast from the Now card", () => {
    render(<SkyHero now={at("2026-09-29T17:12:00Z")} weather={weather()} />);
    expect(
      within(card()).getByRole("link", { name: TODAY_LINK })
    ).toHaveAttribute("href", "/weather/2026/09/08");
  });

  it("puts today's lowest and highest so far either side of the temperature", () => {
    const current = currentConditions({
      ...reading,
      max_temperature_c: 32.4,
      min_temperature_c: 24.1,
    });
    render(
      <SkyHero
        now={at("2026-09-29T17:12:00Z")}
        weather={weather({ current })}
      />
    );
    expect(card()).toHaveTextContent("lowest so far today");
    expect(card()).toHaveTextContent("highest so far today");
  });

  it("adds gusts to the wind line only when recorded", () => {
    const current = currentConditions({ ...reading, wind_gust_kt: 25 });
    render(
      <SkyHero
        now={at("2026-09-29T17:12:00Z")}
        weather={weather({ current })}
      />
    );
    expect(card()).toHaveTextContent("gusts");
    expect(card()).toHaveTextContent("46 km/h");
  });

  it("lists only the measured readings the card does not show", () => {
    render(<SkyHero now={at("2026-09-29T17:12:00Z")} weather={weather()} />);
    expect(terms(nowPanel())).toEqual([
      "Humidity",
      "Dew point",
      "Pressure",
      "Rain, last 3 h",
    ]);
    expect(within(nowPanel()).getByText(", rising")).toBeInTheDocument();
    expect(within(nowPanel()).queryByText("—")).not.toBeInTheDocument();
  });

  it("says when an old reading was taken", () => {
    render(<SkyHero now={at("2026-09-29T21:00:00Z")} weather={weather()} />);
    expect(within(card()).getByText(LAST_OBSERVED)).toBeInTheDocument();
  });

  it("puts the date on the label when the reading is from another day", () => {
    render(<SkyHero now={at("2026-09-30T14:00:00Z")} weather={weather()} />);
    expect(
      within(card()).getByText(LAST_OBSERVED_OTHER_DAY)
    ).toBeInTheDocument();
  });

  it("falls back to the midday product temperature, labelled as such", () => {
    render(<SkyHero weather={weather({ current: null })} />);
    expect(
      within(card()).getByText("Midday reading · MBIA")
    ).toBeInTheDocument();
    expect(within(nowPanel()).queryByRole("term")).not.toBeInTheDocument();
  });
});

describe("Day tabs", () => {
  it("leads with Now, then links each day to its dated route", () => {
    render(<SkyHero weather={weather()} />);
    const links = tabs();
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveTextContent("Now");
    expect(links[1]).toHaveAttribute("href", "/weather/2026/09/08");
    expect(links[1]).toHaveTextContent("Tue");
    expect(links[1]).toHaveTextContent("20% chance of rain");
    expect(links[2]).toHaveAttribute("href", "/weather/2026/09/09");
  });

  it("shows the selected day's forecast in the card and its details below", () => {
    render(<SkyHero selected="2026-09-09" weather={weather()} />);
    expect(tabs()[2]).toHaveAttribute("aria-current", "page");
    expect(tabs()[0]).not.toHaveAttribute("aria-current");
    expect(
      within(card()).getByText(REFERENCE_WEATHER.days[1]?.summary ?? "")
    ).toBeInTheDocument();
    expect(panel()).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Current conditions" })
    ).not.toBeInTheDocument();
  });

  it("selects today's forecast for `today`", () => {
    render(<SkyHero selected="today" weather={weather()} />);
    expect(tabs()[1]).toHaveAttribute("aria-current", "page");
    expect(within(card()).getByText("Midday words")).toBeInTheDocument();
    expect(card()).toHaveTextContent("Rain: 20%");
    expect(card()).toHaveTextContent("gusts");
  });

  it("falls back to Now for a date outside the five days", () => {
    render(<SkyHero selected="2026-12-25" weather={weather()} />);
    expect(nowPanel()).toBeInTheDocument();
  });
});

describe("Switching tabs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the clicked day at once and updates the address without navigating", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<SkyHero weather={weather()} />);
    const target = tabs()[2];
    if (!target) {
      throw new Error("No second day tab");
    }
    const notPrevented = fireEvent.click(target);
    expect(notPrevented).toBe(false);
    expect(tabs()[2]).toHaveAttribute("aria-current", "page");
    expect(
      within(card()).getByText(REFERENCE_WEATHER.days[1]?.summary ?? "")
    ).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/weather/2026/09/09");
  });

  it("returns to the readings when Now is clicked", () => {
    render(<SkyHero selected="2026-09-09" weather={weather()} />);
    fireEvent.click(tabs()[0] as HTMLElement);
    expect(tabs()[0]).toHaveAttribute("aria-current", "page");
    expect(nowPanel()).toBeInTheDocument();
  });

  it("leaves modified clicks to the browser so a day can open in a new tab", () => {
    render(<SkyHero weather={weather()} />);
    const notPrevented = fireEvent.click(tabs()[2] as HTMLElement, {
      ctrlKey: true,
    });
    expect(notPrevented).toBe(true);
    expect(tabs()[0]).toHaveAttribute("aria-current", "page");
  });

  it("follows a real navigation to a different day", () => {
    const { rerender } = render(
      <SkyHero selected="2026-09-08" weather={weather()} />
    );
    fireEvent.click(tabs()[2] as HTMLElement);
    rerender(<SkyHero selected="2026-09-10" weather={weather()} />);
    expect(tabs()[3]).toHaveAttribute("aria-current", "page");
  });
});

describe("Day panel", () => {
  it("shows sun and tides first, then seas and swell", () => {
    render(<SkyHero selected="today" weather={weather()} />);
    expect(terms(panel())).toEqual([
      "Sunrise",
      "Sunset",
      "High tides",
      "Low tides",
      "Seas",
      "Swell",
    ]);
  });

  it("says details come later for a day with nothing issued", () => {
    render(<SkyHero selected="today" weather={unavailableWeather()} />);
    expect(within(panel()).queryByRole("term")).not.toBeInTheDocument();
    expect(within(card()).getByText("No forecast yet")).toBeInTheDocument();
  });
});

describe("hero readings", () => {
  it("reads times as a.m./p.m. and lists every tide on its own", () => {
    const rows = dayReadings(issued());
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel.Sunrise?.value).toBe("5:58 a.m.");
    expect(byLabel.Sunset?.value).toBe("6:02 p.m.");
    expect(byLabel["High tides"]?.rows?.map((row) => row.time)).toEqual([
      "4:12 a.m.",
      "4:30 p.m.",
    ]);
    expect(byLabel["Low tides"]?.rows?.map((row) => row.time)).toEqual([
      "10:20 a.m.",
    ]);
    expect(byLabel.Swell?.detail).toBe("NE every 9 s");
  });

  it("hides what a forecast does not issue and computes sun times", () => {
    const day = issued({ conditions: [{ label: "Wind", value: "E 10 mph" }] });
    const labels = dayReadings(day).map((row) => row.label);
    expect(labels).toEqual(["Sunrise", "Sunset"]);
    for (const row of dayReadings(day)) expect(row.value).toMatch(CLOCK);
  });

  it("shows a Low, Medium or High chance of rain as issued", () => {
    const day = issued({
      conditions: [
        { label: "Wind speed", value: "12–25 mph" },
        { label: "Chance of rain", value: "Medium" },
      ],
    });
    expect(rainChance(day)).toBe("Medium");
  });

  it("never invents a forecast for an outage", () => {
    const outage = unavailableWeather().days[0];
    if (!outage) {
      throw new Error("expected an outage placeholder day");
    }
    expect(dayReadings(outage)).toEqual([]);
    expect(rainChance(outage)).toBeNull();
  });

  it("keeps only recorded readings, with the pressure trend and the rain period", () => {
    const rows = nowReadings(
      currentConditions({
        ...reading,
        cloud_base_max_m: 1000,
        cloud_base_min_m: 600,
        visibility_km: 10,
      })
    );
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel.Pressure).toMatchObject({
      trend: "rising",
      value: "1014.2 hPa",
    });
    expect(byLabel["Rain, last 3 h"]).toMatchObject({ value: "0.4 mm" });
    expect(byLabel.Visibility).toMatchObject({ value: "10 km" });
    expect(byLabel["Cloud base"]).toMatchObject({ value: "600–1000 m" });
    for (const gone of [
      "Wind",
      "Gusts",
      "UV index",
      "Air quality",
      "Cloud cover",
    ])
      expect(byLabel[gone]).toBeUndefined();
  });

  it("explains poor visibility with the observer's words", () => {
    const rows = nowReadings(
      currentConditions({ ...reading, visibility_km: 6, weather: "Haze" })
    );
    expect(rows.find((row) => row.label === "Visibility")?.detail).toBe("Haze");
  });

  it("never reads constant sample values: readings come from the inputs", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, "../../lib/hero-readings.ts"),
      "utf8"
    );
    expect(source).not.toMatch(SAMPLE_REFERENCE);
    expect(existsSync(join(here, "../../lib/hero-samples.ts"))).toBe(false);
    const hot = currentConditions({ ...reading, relative_humidity: 91 });
    const cool = currentConditions({ ...reading, relative_humidity: 40 });
    const humidity = (c: typeof hot) =>
      nowReadings(c).find((row) => row.label === "Humidity")?.value;
    expect(humidity(hot)).not.toBe(humidity(cool));
  });

  it.each([
    ["Light shower", "showers"],
    ["Sunny", "sunny"],
    ["Partly cloudy", "partly-cloudy"],
    [null, "cloudy"],
  ] as const)("reads the sky picture from %s", (words, sky) => {
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
