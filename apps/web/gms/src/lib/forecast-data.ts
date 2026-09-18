import type { WeatherCondition } from "@/lib/weather-icons";
export interface Condition {
  label: string;
  value: string;
}
export interface DayForecast {
  condition: WeatherCondition;
  high: number | null;
  low: number | null;
}
export interface ForecastDayData extends DayForecast {
  conditions: Condition[];
  date: string;
  source: string;
  summary: string;
  title?: string;
}
export interface WeatherSnapshot {
  baseDate: string;
  days: ForecastDayData[];
  label: string;
  observation: { temperature: number; observedAt: string } | null;
}
export const REFERENCE_DATE = "2026-09-08";
function conditions(
  high: string,
  low: string,
  wind: string,
  seas: string,
  sunrise: string,
  sunset: string
): Condition[] {
  return [
    { label: "Max Temp", value: high },
    { label: "Min Temp", value: low },
    { label: "Wind", value: wind },
    { label: "Sea State", value: seas },
    { label: "Sunrise", value: sunrise },
    { label: "Sunset", value: sunset },
  ];
}
export const REFERENCE_WEATHER: WeatherSnapshot = {
  baseDate: REFERENCE_DATE,
  label:
    "Supplied GMS reports · 8 September 2026 · Evening issue 6 p.m. AST. Not a live observation feed.",
  observation: {
    temperature: 31.9,
    observedAt: "8 September 2026, 12:00 p.m. AST",
  },
  days: [
    {
      date: "2026-09-08",
      condition: "showers",
      high: 32.5,
      low: 24.5,
      source: "Midday temperatures; evening conditions · 8 September",
      summary:
        "Tonight: partly cloudy to cloudy with showers, heavy at times, and isolated thunder. Low chance of flash flooding; Small Craft Advisory in the evening report.",
      conditions: [
        ...conditions(
          "32.5°C",
          "24.5°C",
          "ENE–ESE, 12–22 mph; gustier in showers",
          "Moderate; waves 5–7 ft in open water",
          "5:56 a.m.",
          "6:12 p.m."
        ),
        { label: "High Tide", value: "2:15 p.m. (midday report)" },
        { label: "Low Tide", value: "6:00 p.m. (midday report)" },
      ],
    },
    {
      date: "2026-09-09",
      condition: "showers",
      high: 31.5,
      low: 24.5,
      source: "8 September evening report",
      summary:
        "Partly cloudy to cloudy and windy, with light to moderate showers and possible isolated thunder.",
      conditions: conditions(
        "31.5°C",
        "24.5°C",
        "ENE–ESE, 14–24 mph; gustier in showers",
        "Moderate; waves 5–7 ft; NE–E swells",
        "5:56 a.m.",
        "6:12 p.m."
      ),
    },
    {
      date: "2026-09-10",
      condition: "showers",
      high: 31,
      low: 24.5,
      source: "8 September evening report",
      summary:
        "Partly cloudy to cloudy and breezy, with light to moderate showers and possible isolated thunder. Small Craft Advisory in this outlook.",
      conditions: conditions(
        "31.0°C",
        "24.5°C",
        "ENE–ESE, 13–23 mph; higher gusts at times",
        "Moderate; waves 5–7 ft in open water",
        "5:56 a.m.",
        "6:11 p.m."
      ),
    },
    {
      date: "2026-09-11",
      condition: "partly-cloudy",
      high: 32.5,
      low: 24.5,
      source: "8 September evening report",
      summary:
        "Partly cloudy and breezy with brief, light to moderate showers.",
      conditions: conditions(
        "32.5°C",
        "24.5°C",
        "ENE–ESE, 13–23 mph",
        "Moderate; waves 4–6 ft in open water",
        "5:56 a.m.",
        "6:10 p.m."
      ),
    },
    {
      date: "2026-09-12",
      condition: "cloudy",
      high: null,
      low: null,
      source: "No fourth-day values supplied",
      summary:
        "The new evening form supports this fourth day. The supplied report does not contain its forecast.",
      conditions: [
        {
          label: "Forecast",
          value: "No issued data supplied for 12 September",
        },
      ],
    },
  ],
};
export const DAY_FORECASTS = REFERENCE_WEATHER.days;
export const DAY_CONDITIONS = REFERENCE_WEATHER.days.map(
  (day) => day.conditions
);
export const TODAY_CONDITIONS = DAY_CONDITIONS[0];
export { weatherFromForecast } from "@/lib/forecast-selection";
