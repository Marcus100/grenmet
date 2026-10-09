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
  cloudCover: "60%",
  gusts: "23 mph",
  uvIndex: "6",
  visibility: "10 km+",
} as const;

export interface SampleDay {
  airQuality: { index: number; level: string };
  cloudCover: string;
  gusts: string;
  highTides: string;
  humidity: string;
  lowTides: string;
  rainChance: number;
  rainfall: string;
  swell: { detail: string; value: string };
  visibility: string;
}

/** Forecast fields per day offset (0 = today) the issued product may omit. */
export const SAMPLE_DAYS: readonly SampleDay[] = [
  {
    airQuality: { index: 35, level: "Good" },
    cloudCover: "60–80%",
    gusts: "25 mph",
    highTides: "03:48 · 16:02",
    humidity: "75–90%",
    lowTides: "09:55 · 22:10",
    rainChance: 40,
    rainfall: "5–10 mm",
    swell: { detail: "9 s period", value: "NE 1.4 m" },
    visibility: "10 km+",
  },
  {
    airQuality: { index: 30, level: "Good" },
    cloudCover: "70%",
    gusts: "35 mph",
    highTides: "04:35 · 16:50",
    humidity: "75–90%",
    lowTides: "10:42 · 23:00",
    rainChance: 60,
    rainfall: "8–15 mm",
    swell: { detail: "9 s period", value: "NE 1.5 m" },
    visibility: "10 km",
  },
  {
    airQuality: { index: 28, level: "Good" },
    cloudCover: "30%",
    gusts: "22 mph",
    highTides: "05:24 · 17:40",
    humidity: "65–80%",
    lowTides: "11:31 · 23:50",
    rainChance: 20,
    rainfall: "0–2 mm",
    swell: { detail: "8 s period", value: "NE 1.2 m" },
    visibility: "10 km+",
  },
  {
    airQuality: { index: 32, level: "Good" },
    cloudCover: "40%",
    gusts: "22 mph",
    highTides: "06:18 · 18:35",
    humidity: "70–85%",
    lowTides: "00:45 · 12:25",
    rainChance: 30,
    rainfall: "0–3 mm",
    swell: { detail: "8 s period", value: "NE 1.1 m" },
    visibility: "10 km+",
  },
  {
    airQuality: { index: 55, level: "Moderate" },
    cloudCover: "65%",
    gusts: "30 mph",
    highTides: "07:17 · 19:30",
    humidity: "75–90%",
    lowTides: "01:44 · 13:20",
    rainChance: 50,
    rainfall: "5–10 mm",
    swell: { detail: "10 s period", value: "ENE 1.6 m" },
    visibility: "10 km",
  },
];

export const SAMPLE_SUN = { sunrise: "05:57", sunset: "18:01" } as const;

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
