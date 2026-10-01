/**
 * Sample values for sky hero fields the FastAPI feeds do not carry yet.
 *
 * Owner decision (30 Sep 2026): the hero fills these gaps with sample values
 * rather than hiding the rows. They only fill a gap in a real reading or a
 * real issued forecast; an outage or an unissued day never gets sample
 * figures. Delete an entry here once FastAPI supplies the field.
 */

/** Observation fields the MBIA register does not record. */
export const SAMPLE_NOW = {
  airQuality: { index: 34, level: "Good" },
  gusts: "23 mph",
  visibility: "10 km+",
} as const;

/** Forecast fields per day offset (0 = today) the issued product may omit. */
export const SAMPLE_DAYS = [
  { rainChance: 40, gusts: "25 mph", highTide: "03:48", lowTide: "09:55" },
  { rainChance: 60, gusts: "35 mph", highTide: "04:35", lowTide: "10:42" },
  { rainChance: 20, gusts: "22 mph", highTide: "05:24", lowTide: "11:31" },
  { rainChance: 30, gusts: "22 mph", highTide: "06:18", lowTide: "00:45" },
  { rainChance: 50, gusts: "30 mph", highTide: "07:17", lowTide: "01:44" },
] as const;

export const SAMPLE_SUN = { sunrise: "05:57", sunset: "18:01" } as const;

export type PeriodSky = "fair" | "partly-cloudy" | "showers" | "sunny";
export interface DayPeriod {
  label: string;
  sky: PeriodSky;
  summary: string;
}

/** Morning / afternoon / night skies; wxproducts issues one summary per day. */
export const SAMPLE_PERIODS: readonly (readonly DayPeriod[])[] = [
  [
    { label: "Afternoon", sky: "showers", summary: "Scattered showers" },
    { label: "Evening", sky: "partly-cloudy", summary: "Showers ending" },
    { label: "Tonight", sky: "fair", summary: "Mostly fair" },
  ],
  [
    { label: "Morning", sky: "partly-cloudy", summary: "Cloudy spells" },
    { label: "Afternoon", sky: "showers", summary: "Heavy showers" },
    { label: "Night", sky: "showers", summary: "Showers easing" },
  ],
  [
    { label: "Morning", sky: "sunny", summary: "Hazy sun" },
    { label: "Afternoon", sky: "partly-cloudy", summary: "Isolated shower" },
    { label: "Night", sky: "fair", summary: "Hazy, fair" },
  ],
  [
    { label: "Morning", sky: "sunny", summary: "Sunny" },
    { label: "Afternoon", sky: "showers", summary: "A few showers" },
    { label: "Night", sky: "fair", summary: "Mostly fair" },
  ],
  [
    { label: "Morning", sky: "partly-cloudy", summary: "Partly cloudy" },
    { label: "Afternoon", sky: "showers", summary: "Showers" },
    { label: "Night", sky: "showers", summary: "Showers" },
  ],
];

/**
 * Feels-like temperature (NWS heat index, Rothfusz regression) until the
 * observation feed supplies one. Below 27 °C it is the air temperature.
 */
export function feelsLike(celsius: number, humidity: number | null): number {
  if (humidity === null || celsius < 27) return celsius;
  const t = (celsius * 9) / 5 + 32;
  const r = humidity;
  const f =
    -42.379 +
    2.049_015_23 * t +
    10.143_331_27 * r -
    0.224_755_41 * t * r -
    0.006_837_83 * t * t -
    0.054_817_17 * r * r +
    0.001_228_74 * t * t * r +
    0.000_852_82 * t * r * r -
    0.000_001_99 * t * t * r * r;
  return ((f - 32) * 5) / 9;
}
