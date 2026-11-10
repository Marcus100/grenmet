/**
 * Weather types a forecaster can pick (owner decision 7, issue #1197): a fixed
 * list relevant to Grenada, each with an optional coverage word and the SYNOP
 * present-weather (ww, WMO code table 4677) and METAR codes it stands for, so
 * forecasts can later be verified against the eRegister hourlies at MBIA.
 *
 * Shared by the forecast editors and the eRegister. FastAPI mirrors the table
 * in `src/wxproducts/synop_codes.py` (`WEATHER_PHENOMENA`); a test keeps them
 * equal, so keep one entry per object with the keys in this order.
 *
 * Stored value: comma-separated `id` or `id:coverage` items, for example
 * `showers-light:scattered,haze`. The public sentence is generated from it
 * (`weatherSentence`) and stays editable in its own field.
 */
export const WEATHER_COVERAGE = {
  isolated: "Isolated",
  scattered: "Scattered",
  numerous: "Numerous",
  occasional: "Occasional",
  periods: "Periods of",
} as const;
export type WeatherCoverage = keyof typeof WEATHER_COVERAGE;

const CONVECTIVE = ["isolated", "scattered", "numerous"] as const;
const STEADY = ["occasional", "periods"] as const;

export const WEATHER_PHENOMENA = [
  {
    id: "fair",
    label: "Fair, no significant weather",
    phrase: "fair weather",
    ww: [0, 1, 2, 3],
    metar: ["NSW"],
    coverage: [],
  },
  {
    id: "haze",
    label: "Haze",
    phrase: "haze",
    ww: [5],
    metar: ["HZ"],
    coverage: [],
  },
  {
    id: "saharan-dust",
    label: "Saharan dust haze",
    phrase: "Saharan dust haze",
    ww: [6],
    metar: ["DU", "HZ"],
    coverage: [],
  },
  {
    id: "showers-light",
    label: "Light showers",
    phrase: "light showers",
    ww: [80],
    metar: ["-SHRA"],
    coverage: CONVECTIVE,
  },
  {
    id: "showers-moderate",
    label: "Moderate showers",
    phrase: "moderate showers",
    ww: [81],
    metar: ["SHRA"],
    coverage: CONVECTIVE,
  },
  {
    id: "showers-heavy",
    label: "Heavy showers",
    phrase: "heavy showers",
    ww: [81, 82],
    metar: ["+SHRA"],
    coverage: CONVECTIVE,
  },
  {
    id: "rain-light",
    label: "Light rain",
    phrase: "light rain",
    ww: [51, 61],
    metar: ["-RA"],
    coverage: STEADY,
  },
  {
    id: "rain-moderate",
    label: "Moderate rain",
    phrase: "moderate rain",
    ww: [63],
    metar: ["RA"],
    coverage: STEADY,
  },
  {
    id: "rain-heavy",
    label: "Heavy rain",
    phrase: "heavy rain",
    ww: [65],
    metar: ["+RA"],
    coverage: STEADY,
  },
  {
    id: "thunderstorms",
    label: "Thunderstorms",
    phrase: "thunderstorms",
    ww: [17, 95, 97],
    metar: ["TS", "TSRA"],
    coverage: CONVECTIVE,
  },
  {
    id: "mist",
    label: "Mist (rare)",
    phrase: "mist",
    ww: [10],
    metar: ["BR"],
    coverage: [],
  },
  {
    id: "fog",
    label: "Fog (rare)",
    phrase: "fog",
    ww: [45],
    metar: ["FG"],
    coverage: [],
  },
] as const;
export type WeatherPhenomenon = (typeof WEATHER_PHENOMENA)[number];
export type WeatherPhenomenonId = WeatherPhenomenon["id"];

/**
 * Single weather types stored before the multi-select (23 October 2026 list),
 * read as the new items so older issues still open and render.
 */
export const LEGACY_WEATHER_TYPES: Record<string, WeatherPhenomenonId> = {
  Haze: "haze",
  "Dust haze": "saharan-dust",
  Mist: "mist",
  "Thunder (no rain)": "thunderstorms",
  Fog: "fog",
  Drizzle: "rain-light",
  "Light rain": "rain-light",
  "Moderate rain": "rain-moderate",
  "Heavy rain": "rain-heavy",
  "Light showers": "showers-light",
  "Moderate or heavy showers": "showers-moderate",
  "Violent showers": "showers-heavy",
  Thunderstorms: "thunderstorms",
  "Severe thunderstorms": "thunderstorms",
};

export interface WeatherItem {
  coverage?: WeatherCoverage;
  id: WeatherPhenomenonId;
}

export function weatherPhenomenon(id: string): WeatherPhenomenon | undefined {
  return WEATHER_PHENOMENA.find((p) => p.id === id);
}

function allowsCoverage(phenomenon: WeatherPhenomenon, coverage: string) {
  return (phenomenon.coverage as readonly string[]).includes(coverage);
}

/** Known items in list order; unknown or repeated items are dropped. Legacy labels are read too. */
export function parseWeather(value: string | undefined): WeatherItem[] {
  const legacy = LEGACY_WEATHER_TYPES[value?.trim() ?? ""];
  if (legacy) return [{ id: legacy }];
  const items = new Map<string, WeatherItem>();
  for (const part of (value ?? "").split(",")) {
    const [id = "", coverage = ""] = part.trim().split(":");
    const phenomenon = weatherPhenomenon(id);
    if (!phenomenon || items.has(id)) continue;
    items.set(
      id,
      allowsCoverage(phenomenon, coverage)
        ? { id: phenomenon.id, coverage: coverage as WeatherCoverage }
        : { id: phenomenon.id }
    );
  }
  return WEATHER_PHENOMENA.flatMap((p) => {
    const item = items.get(p.id);
    return item ? [item] : [];
  });
}

export function formatWeather(items: readonly WeatherItem[]): string {
  return items
    .map((item) => (item.coverage ? `${item.id}:${item.coverage}` : item.id))
    .join(",");
}

/** True when every stored item is a listed phenomenon with an allowed coverage word. */
export function isValidWeather(value: string): boolean {
  if (!value.trim() || LEGACY_WEATHER_TYPES[value.trim()]) return true;
  return value.split(",").every((part) => {
    const [id = "", coverage, extra] = part.trim().split(":");
    const phenomenon = weatherPhenomenon(id);
    if (!phenomenon || extra !== undefined) return false;
    return coverage === undefined || allowsCoverage(phenomenon, coverage);
  });
}

function phraseOf(item: WeatherItem) {
  const phrase = weatherPhenomenon(item.id)?.phrase ?? item.id;
  return item.coverage
    ? `${WEATHER_COVERAGE[item.coverage].toLowerCase()} ${phrase}`
    : phrase;
}

/** "Scattered light showers and Saharan dust haze." — the public sentence. */
export function weatherSentence(value: string | undefined): string {
  const phrases = parseWeather(value).map(phraseOf);
  if (!phrases.length) return "";
  const last = phrases.pop() ?? "";
  const text = phrases.length ? `${phrases.join(", ")} and ${last}` : last;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** SYNOP ww and METAR codes the stored items stand for (verification). */
export function weatherCodes(value: string | undefined) {
  const items = parseWeather(value).flatMap((item) => {
    const p = weatherPhenomenon(item.id);
    return p ? [p] : [];
  });
  return {
    ww: [...new Set(items.flatMap((p) => p.ww))].sort((a, b) => a - b),
    metar: [...new Set(items.flatMap((p) => p.metar))],
  };
}
