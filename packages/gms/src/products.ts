import type { ProductGuidance } from "@barrelsgd/api-client";

/** Authored GMS products are separate from CAP alerts. */
export const BULLETIN_CATEGORIES = {
  cyclone: "Tropical Cyclone",
  marine: "Marine / Small Craft",
  flood: "Flood / Heavy Rain",
  thunderstorm: "Thunderstorm",
  wind: "Wind",
  heat: "Heat",
  dust: "Dust / Haze",
  coastal: "Coastal Hazard",
  tsunami: "Tsunami",
} as const;
export const PRODUCT_KINDS = {
  morning: "Morning Forecast",
  midday: "Midday Forecast",
  evening: "Evening Forecast",
  outlook: "Tropical Weather Outlook",
  /** Daily 05:00 marine forecast, valid 05:00–05:00 (distinct from the Small Craft bulletin `marine`). */
  "marine-forecast": "Marine Forecast",
  /** Monthly climate bulletin issued on the 15th for the previous month. */
  "climate-bulletin": "Climate Bulletin",
  ...BULLETIN_CATEGORIES,
} as const;
export type ProductKind = keyof typeof PRODUCT_KINDS;
/**
 * Forecasts: the three land forecasts and the 05:00 Marine Forecast. They share
 * the forecaster stamp, the fixed area and the imported alerts and warnings in
 * force (no typed impact or alert text).
 */
export function isForecastKind(kind: ProductKind) {
  return (
    kind === "morning" ||
    kind === "midday" ||
    kind === "evening" ||
    kind === "marine-forecast"
  );
}
export type ProductValues = Record<string, string>;
/**
 * Where a field's value can later be filled from automatically (issue #1197):
 * the yearly almanac table (sun and moon), the imported tide table, or the
 * latest NHC product. Only a marker for now; nothing fetches yet. Editors and
 * FastAPI read it through `fillableFields`.
 */
export type FillSource = "almanac" | "tides" | "nhc";
export interface ProductField {
  /** Planned automatic source; the value always stays editable. */
  fillFrom?: FillSource;
  key: string;
  label: string;
  options?: readonly string[];
  required?: boolean;
  section: string;
  type?:
    | "text"
    | "textarea"
    | "date"
    | "datetime-local"
    | "number"
    | "time"
    /** Several sectors from `SECTORS`, stored comma-separated. */
    | "sectors"
    /** Weather types with coverage words (`./weather-types`), stored comma-separated. */
    | "weather";
}
export interface ProductContent {
  guidance?: ProductGuidance | null;
  kind: ProductKind;
  values: ProductValues;
}
export interface PublishedProduct extends ProductContent {
  id: string;
  publishedAt: string;
  revision: number;
}
export interface StoredProduct extends ProductContent {
  id: string;
  publishedRevision: number | null;
  revision: number;
  updatedAt: string;
}
/** Marine products give wind in knots and heights in metres (owner, 9 Nov 2026); land forecasts stay mph and feet. */
export function isMarineKind(kind: ProductKind) {
  return kind === "marine" || kind === "marine-forecast";
}
export function isProductKind(value: string): value is ProductKind {
  return Object.hasOwn(PRODUCT_KINDS, value);
}
export function isBulletin(kind: ProductKind) {
  return Object.hasOwn(BULLETIN_CATEGORIES, kind);
}
export function productTitle(kind: ProductKind) {
  return isBulletin(kind)
    ? `${PRODUCT_KINDS[kind]} Bulletin`
    : PRODUCT_KINDS[kind];
}
export interface CapInsertTarget {
  label: string;
  value: string;
}
/**
 * Fields on this product kind that CAP text can be copied into. Forecast
 * kinds carry `summary` (plus `dayNWeather` on evening); bulletins share the
 * generic `Impact and response` fields from `productFields`; outlook has its
 * own narrative fields. Empty for a kind with no sensible insertion point.
 */
export function capInsertTargets(kind: ProductKind): CapInsertTarget[] {
  if (kind === "marine-forecast") {
    return [{ label: "Synopsis", value: "synopsis" }];
  }
  if (isForecastKind(kind)) {
    const targets: CapInsertTarget[] = [
      { label: "Forecast summary", value: "summary" },
    ];
    if (kind === "evening") {
      for (let day = 1; day <= 4; day++) {
        targets.push({
          label: `Day ${day} weather`,
          value: `day${day}Weather`,
        });
      }
    }
    return targets;
  }
  if (kind === "outlook") {
    return [
      { label: "Tropical waves and systems", value: "systems" },
      { label: "Cyclone formation outlook", value: "formation" },
    ];
  }
  if (isBulletin(kind)) {
    return [
      { label: "Synopsis", value: "synopsis" },
      { label: "Expected impacts", value: "impacts" },
      { label: "Recommended response", value: "response" },
    ];
  }
  return [];
}
const levels = ["Minimal", "Minor", "Significant", "Severe"];
/** 16-point compass (WMO wind direction is reported in degrees true). */
export const COMPASS_DIRECTIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
  "Variable",
] as const;
/** WMO code table 3700 (state of the sea): term, code and height band in metres. */
export const SEA_STATES = [
  { term: "Calm (glassy)", code: 0, band: "0 m" },
  { term: "Calm (rippled)", code: 1, band: "0–0.1 m" },
  { term: "Smooth", code: 2, band: "0.1–0.5 m" },
  { term: "Slight", code: 3, band: "0.5–1.25 m" },
  { term: "Moderate", code: 4, band: "1.25–2.5 m" },
  { term: "Rough", code: 5, band: "2.5–4 m" },
  { term: "Very rough", code: 6, band: "4–6 m" },
  { term: "High", code: 7, band: "6–9 m" },
  { term: "Very high", code: 8, band: "9–14 m" },
  { term: "Phenomenal", code: 9, band: "over 14 m" },
] as const;
/** Matches the GMS site's weather icons (`apps/web/gms/src/lib/weather-icons.ts`). */
/** Sky cover, as in a METAR; showers and thunder go in the forecast text. */
export const WEATHER_CONDITIONS = [
  "Clear",
  "Fair",
  "Partly cloudy",
  "Cloudy",
  "Overcast",
] as const;
export const RAIN_CHANCES = ["Low", "Medium", "High"] as const;

/**
 * SYNOP links (owner, 23 October 2026) so forecasts can later be verified
 * against the eRegister hourlies at MBIA. Conditions map to total cloud N in
 * oktas (METAR bands) and rain chance to probability bands (%) for scoring;
 * weather types map to present weather ww and METAR codes in
 * `./weather-types` (multi-select since 9 Nov 2026). FastAPI mirrors these tables in
 * `src/wxproducts/synop_codes.py` (a test keeps them equal).
 */
export const CONDITION_OKTAS: Record<
  (typeof WEATHER_CONDITIONS)[number],
  readonly [number, number]
> = {
  Clear: [0, 0],
  Fair: [1, 2],
  "Partly cloudy": [3, 4],
  Cloudy: [5, 7],
  Overcast: [8, 8],
};
export const RAIN_CHANCE_BANDS: Record<
  (typeof RAIN_CHANCES)[number],
  readonly [number, number]
> = {
  Low: [0, 30],
  Medium: [30, 60],
  High: [60, 100],
};
/** Principal and intermediate lunar phases for the marine astronomy block. */
export const MOON_PHASES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
] as const;
export const TIDE_SLOTS = [1, 2, 3, 4] as const;
const likelihoods = ["Very low", "Low", "Medium", "High"];
const DAY_ALERT_FIELD = /^day[1-4](Alerts|Impact|Response)$/u;
function field(
  section: string,
  key: string,
  label: string,
  extra: Partial<ProductField> = {}
): ProductField {
  return { section, key, label, ...extra };
}
const issueFields = [
  field("Issue details", "issuedAt", "Issue date and time (Grenada)", {
    type: "datetime-local",
    required: true,
  }),
  field("Issue details", "validFrom", "Valid from (Grenada)", {
    type: "datetime-local",
    required: true,
  }),
  field("Issue details", "validTo", "Valid until (Grenada)", {
    type: "datetime-local",
    required: true,
  }),
  field("Issue details", "validity", "Validity description"),
  field("Issue details", "area", "Area covered", { required: true }),
  field("Issue details", "forecaster", "Forecaster on duty", {
    required: true,
  }),
];
const astronomy = [
  field("Astronomy", "highTides", "High tides (times)"),
  field("Astronomy", "lowTides", "Low tides (times)"),
  field("Astronomy", "sunrise", "Sunrise"),
  field("Astronomy", "sunset", "Sunset"),
];
/**
 * Morning forecast: the next sun events only (owner, 9 Nov 2026). The older
 * free-text `sunrise` and `sunset` stay in the schema, hidden, so earlier
 * issues still open and print.
 */
const morningAstronomy = [
  field("Astronomy", "sunsetToday", "Sunset today", {
    type: "time",
    fillFrom: "almanac",
  }),
  field("Astronomy", "sunriseTomorrow", "Sunrise tomorrow", {
    type: "time",
    fillFrom: "almanac",
  }),
];
/** Weather types (multi-select) and the public sentence generated from them. */
function weatherTypeFields(section: string, prefix: string): ProductField[] {
  const key = (name: string) => parameterKey(prefix, name);
  return [
    field(section, key("weatherType"), "Weather type", { type: "weather" }),
    field(section, key("weatherTypeText"), "Weather wording"),
  ];
}
/** `windDirFrom` for the main period, `day1WindDirFrom` for an evening outlook day. */
export function parameterKey(prefix: string, name: string) {
  return prefix
    ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`
    : name;
}
function windFields(section: string, prefix: string): ProductField[] {
  const key = (name: string) => parameterKey(prefix, name);
  return [
    field(section, key("windDirFrom"), "Direction from", {
      options: COMPASS_DIRECTIONS,
      required: true,
    }),
    field(section, key("windDirTo"), "Direction to", {
      options: COMPASS_DIRECTIONS,
    }),
    field(section, key("windSpeedMin"), "Speed from (kt)", {
      type: "number",
      required: true,
    }),
    field(section, key("windSpeedMax"), "Speed to (kt)", { type: "number" }),
    field(section, key("windGust"), "Gusts (kt)", { type: "number" }),
    field(section, key("wind"), "Wind summary"),
  ];
}
function marineFields(section: string, prefix: string): ProductField[] {
  const key = (name: string) => parameterKey(prefix, name);
  const terms = SEA_STATES.map((s) => s.term);
  return [
    field(section, key("seaStateFrom"), "Sea state from", {
      options: terms,
      required: true,
    }),
    field(section, key("seaStateTo"), "Sea state to", { options: terms }),
    field(section, key("waveHeightMin"), "Waves from (m)", {
      type: "number",
      required: true,
    }),
    field(section, key("waveHeightMax"), "Waves to (m)", { type: "number" }),
    field(section, key("swellDir"), "Swell direction", {
      options: COMPASS_DIRECTIONS,
    }),
    field(section, key("swellHeight"), "Swell height (m)", { type: "number" }),
    field(section, key("swellPeriod"), "Swell period (s)", { type: "number" }),
    field(section, key("seaState"), "Marine summary"),
  ];
}
/** Horizontal visibility in km (WMO reports metres); FastAPI composes `visibility`. */
function visibilityFields(section: string, required: boolean): ProductField[] {
  return [
    field(section, "visibilityMin", "Visibility from (km)", {
      type: "number",
      required,
    }),
    field(section, "visibilityMax", "Visibility to (km)", { type: "number" }),
    field(section, "visibility", "Visibility summary"),
  ];
}
function tideFields(section: string, prefix: string): ProductField[] {
  const key = (name: string) => parameterKey(prefix, name);
  return [
    ...TIDE_SLOTS.flatMap((n) => [
      field(section, key(`tide${n}Type`), `Tide ${n}`, {
        options: ["High", "Low"],
        fillFrom: "tides",
      }),
      field(section, key(`tide${n}Time`), `Tide ${n} time`, {
        type: "time",
        fillFrom: "tides",
      }),
      field(section, key(`tide${n}Height`), `Tide ${n} height (m)`, {
        type: "number",
        fillFrom: "tides",
      }),
    ]),
    ...(prefix
      ? [
          field(section, key("highTides"), "High tides (times)"),
          field(section, key("lowTides"), "Low tides (times)"),
        ]
      : []),
  ];
}
const COMPOSED_KEY =
  /^(wind|seaState|swell|visibility|highTides|lowTides|day[1-4](Wind|SeaState|HighTides|LowTides))$/u;
/** Legacy free-text keys FastAPI composes from structured values (forecasts, evening days, marine/wind/coastal bulletins). */
export function isComposedForecastField(key: string) {
  return COMPOSED_KEY.test(key);
}
function forecastFields(kind: ProductKind): ProductField[] {
  return [
    field(
      "Weather",
      "summary",
      kind === "evening" ? "Tonight's weather forecast" : "Weather forecast",
      { type: "textarea", required: true }
    ),
    field("Weather", "condition", "Conditions", {
      options: WEATHER_CONDITIONS,
    }),
    ...weatherTypeFields("Weather", ""),
    field("Weather", "rainChance", "Chance of rain", {
      options: RAIN_CHANCES,
    }),
    field("Weather", "weatherAlert", "Weather alert"),
    // Morning and midday print "Today's Max | Tonight's Min"; the evening
    // tonight block has no maximum (hidden below, kept for older issues).
    field("Weather", "maxTemperature", "Maximum temperature (°C)", {
      type: "number",
      ...(kind === "evening" ? {} : { required: true }),
    }),
    field("Weather", "minTemperature", "Minimum temperature (°C)", {
      type: "number",
      required: true,
    }),
    ...(kind === "midday"
      ? [
          field(
            "Weather",
            "observedTemperature",
            "Midday temperature at MBIA (°C)",
            { type: "number", required: true }
          ),
        ]
      : []),
    ...windFields("Wind", ""),
    field("Wind", "windAlert", "Wind alert"),
    ...marineFields("Marine", ""),
    field("Marine", "marineAlert", "Marine alert"),
    ...["weather", "wind", "marine", "heat", "dust"].flatMap((hazard) => {
      const section = `${hazard.charAt(0).toUpperCase()}${hazard.slice(1)} impacts`;
      return [
        field(section, `${hazard}Likelihood`, "Likelihood", {
          options: likelihoods,
        }),
        field(section, `${hazard}Level`, "Impact level", { options: levels }),
        field(section, `${hazard}Impact`, "Expected impacts", {
          type: "textarea",
        }),
        field(section, `${hazard}Response`, "Recommended response", {
          type: "textarea",
        }),
      ];
    }),
    ...tideFields("Tides", ""),
    // JSON summary of CAP alerts and GMS bulletins in force, captured by FastAPI on save.
    field("Issue details", "advisories", "Alerts and advisories in force"),
    ...astronomy,
    ...(kind === "morning" ? morningAstronomy : []),
    field("Risk assessment", "likelihood", "Overall likelihood", {
      options: likelihoods,
    }),
    field("Risk assessment", "impact", "Overall impact", {
      options: levels,
    }),
    field("Risk assessment", "response", "Overall response", {
      type: "textarea",
    }),
    field("Word of the day", "word", "Term"),
    field("Word of the day", "definition", "Meaning", { type: "textarea" }),
    ...(kind === "evening"
      ? Array.from({ length: 4 }, (_, i) => {
          const section = `Day ${i + 1}`;
          const prefix = `day${i + 1}`;
          return [
            field(section, `${prefix}Date`, "Date", {
              type: "date",
              required: true,
            }),
            field(section, `${prefix}Weather`, "Weather", {
              type: "textarea",
              required: true,
            }),
            ...weatherTypeFields(section, prefix),
            field(section, `${prefix}Max`, "Maximum temperature (°C)", {
              type: "number",
              required: true,
            }),
            field(section, `${prefix}Min`, "Minimum temperature (°C)", {
              type: "number",
              required: true,
            }),
            ...windFields(`${section} · Wind`, prefix),
            ...marineFields(`${section} · Marine`, prefix),
            field(
              section,
              `${prefix}Alerts`,
              "Weather, wind and marine alerts"
            ),
            field(section, `${prefix}Impact`, "Expected impacts", {
              type: "textarea",
            }),
            field(section, `${prefix}Response`, "Recommended response", {
              type: "textarea",
            }),
            field(section, `${prefix}Sunrise`, "Sunrise"),
            field(section, `${prefix}Sunset`, "Sunset"),
            ...tideFields(`${section} · Tides`, prefix),
          ];
        }).flat()
      : []),
  ];
}
const hazardDetails: Record<keyof typeof BULLETIN_CATEGORIES, ProductField[]> =
  {
    marine: [
      field("Weather", "weather", "Weather", {
        type: "textarea",
        required: true,
      }),
      ...visibilityFields("Visibility", true),
      ...windFields("Wind", ""),
      ...marineFields("Marine", ""),
      ...tideFields("Tides", ""),
      ...astronomy,
      field("Astronomy", "moonrise", "Moonrise"),
      field("Astronomy", "moonset", "Moonset"),
      field("Astronomy", "lastMoonPhase", "Last moon phase and date"),
      field("Astronomy", "nextMoonPhase", "Next moon phase and date"),
    ],
    cyclone: [
      field("Weather", "systemName", "System name / identifier"),
      field("Weather", "position", "Location / coordinates"),
      field("Weather", "movement", "Movement (include units)"),
      field("Weather", "wind", "Maximum winds and gusts (include units)"),
      field("Weather", "pressure", "Central pressure (hPa)", {
        type: "number",
      }),
      field("Weather", "track", "Expected track and timing", {
        type: "textarea",
      }),
    ],
    flood: [
      field("Weather", "rainfall", "Expected rainfall, duration and units"),
      field("Weather", "flooding", "Flood-prone areas / river conditions", {
        type: "textarea",
      }),
    ],
    thunderstorm: [
      field("Weather", "storms", "Storm timing, coverage and intensity", {
        type: "textarea",
      }),
      field("Weather", "hazards", "Lightning, gusts, hail and rainfall", {
        type: "textarea",
      }),
    ],
    wind: windFields("Wind", ""),
    heat: [
      field("Heat assessment", "eventType", "Event classification", {
        options: ["Hot Spell", "Heatwave"],
        required: true,
      }),
      field("Heat assessment", "assessmentBasis", "Assessment basis", {
        options: ["Observed", "Forecast", "Observed and forecast"],
        required: true,
      }),
      field(
        "Heat assessment",
        "maxTemperature",
        "Expected daytime maximum (°C)",
        { type: "number", required: true }
      ),
      field(
        "Heat assessment",
        "minTemperature",
        "Expected nighttime minimum (°C)",
        { type: "number", required: true }
      ),
      field("Heat assessment", "observedMax", "Observed daytime maximum (°C)", {
        type: "number",
      }),
      field(
        "Heat assessment",
        "observedMin",
        "Observed nighttime minimum (°C)",
        { type: "number" }
      ),
      field("Heat assessment", "consecutiveDays", "Consecutive days", {
        type: "number",
        required: true,
      }),
      field(
        "Heat assessment",
        "nightThreshold",
        "Approved nighttime 90th-percentile threshold (°C)",
        { type: "number" }
      ),
      field(
        "Heat assessment",
        "thresholdBasis",
        "Threshold reference period, season and station / area",
        { type: "textarea" }
      ),
      field(
        "Heat assessment",
        "nightRecovery",
        "Nighttime recovery assessment",
        { type: "textarea" }
      ),
      field(
        "Supporting guidance",
        "healthGuidance",
        "Supporting heat-health / activity guidance",
        { type: "textarea" }
      ),
    ],
    dust: [
      field("Weather", "dust", "Dust / haze concentration and extent", {
        type: "textarea",
      }),
      ...visibilityFields("Visibility", false),
    ],
    coastal: [
      field("Swell", "swellDir", "Swell direction", {
        options: COMPASS_DIRECTIONS,
      }),
      field("Swell", "swellPeriod", "Swell period (s)", { type: "number" }),
      field("Swell", "swellHeight", "Swell height (m)", { type: "number" }),
      field("Swell", "swell", "Swell summary"),
      field("Weather", "surge", "Surge / coastal inundation (include units)"),
      field("Weather", "tides", "High tides and affected coastlines"),
    ],
    tsunami: [
      field("Weather", "source", "Event source / official bulletin reference"),
      field("Weather", "eventTime", "Event date and time (include time zone)"),
      field("Weather", "location", "Event location and magnitude"),
      field("Weather", "arrival", "Expected arrival times (include time zone)"),
      field("Weather", "waveHeight", "Expected wave heights (include units)"),
    ],
  };
export function productFields(kind: ProductKind): ProductField[] {
  if (kind === "outlook")
    return [
      ...issueFields,
      field("Outlook", "source", "Source / attribution", { required: true }),
      field("Outlook", "specialInterest", "Area of special interest", {
        required: true,
      }),
      field(
        "Outlook",
        "systems",
        "Tropical waves and systems — name, position, movement, convection and local effects",
        { type: "textarea", required: true }
      ),
      field(
        "Outlook",
        "formation",
        "Cyclone formation outlook and forecast period",
        { type: "textarea", required: true }
      ),
      field("Outlook", "formationChance48h", "Formation chance, 48 hours (%)", {
        type: "number",
      }),
      field("Outlook", "formationChance7d", "Formation chance, 7 days (%)", {
        type: "number",
      }),
      field("Outlook", "nextUpdate", "Next update (Grenada)", {
        type: "datetime-local",
        required: true,
      }),
    ];
  if (kind === "morning" || kind === "midday" || kind === "evening")
    return [...issueFields, ...forecastFields(kind)];
  if (kind === "marine-forecast") return marineForecastFields();
  if (kind === "climate-bulletin") return climateBulletinFields();
  return [
    ...issueFields,
    // Numbered per event (#1, #2… within one hazard episode); the desk
    // proposes the next one (`proposeBulletinNumber`).
    field("Bulletin", "bulletinNumber", "Bulletin number"),
    // Year-based archive and CAP reference, set by FastAPI on first save.
    field("Bulletin", "reference", "Archive reference"),
    // GMS alerts are green only. Yellow, orange and red are CAP warnings,
    // started from "Raise to warning" (ADR-0051). Saved older revisions keep
    // their original level and are never re-validated. The desk hides it.
    field("Bulletin", "level", "Colour level", {
      options: ["Green"],
      required: true,
    }),
    field("Bulletin", "notice", "Bulletin purpose", {
      options: ["Information", "Advisory", "All clear"],
      required: true,
    }),
    field("Bulletin", "synopsis", "Synopsis", {
      type: "textarea",
      required: true,
    }),
    ...hazardDetails[kind],
    field("Impact and response", "likelihood", "Likelihood", {
      options: likelihoods,
      required: true,
    }),
    field("Impact and response", "impact", "Impact level", {
      options: levels,
      required: true,
    }),
    field("Impact and response", "impacts", "Expected impacts", {
      type: "textarea",
      required: true,
    }),
    field("Impact and response", "response", "Recommended response", {
      type: "textarea",
      required: true,
    }),
    // Optional. Untagged means it affects everyone (Plan your week).
    field("Impact and response", "sectors", "Sectors affected", {
      type: "sectors",
    }),
    field("Impact and response", "nextUpdate", "Next update (Grenada)", {
      type: "datetime-local",
    }),
  ];
}
/**
 * Marine Forecast, in the order of owner decision 3 (#1197): validity,
 * advisories in force, synopsis, wind, sea state and significant wave height,
 * swell, weather, visibility, (small-craft statement), outlook, then tides and
 * astronomy. Wind is entered and printed in knots, heights in metres.
 */
function marineForecastFields(): ProductField[] {
  const almanac = { fillFrom: "almanac" } as const;
  return [
    ...issueFields,
    // Small craft and other warnings come from the alerts and CAP warnings in
    // force, captured by FastAPI on save; nobody types them. The small-craft
    // statement on the sheet is composed from them.
    field("Issue details", "advisories", "Alerts and advisories in force"),
    field("Synopsis", "synopsis", "Synopsis", {
      type: "textarea",
      required: true,
    }),
    ...windFields("Wind", ""),
    ...marineFields("Seas and swell", ""),
    ...weatherTypeFields("Weather", ""),
    ...visibilityFields("Visibility", false),
    field("Outlook", "outlook", "Outlook (next 24 hours)", {
      type: "textarea",
      required: true,
    }),
    ...tideFields("Tides", ""),
    field("Astronomy", "sunrise", "Sunrise", { type: "time", ...almanac }),
    field("Astronomy", "sunset", "Sunset", { type: "time", ...almanac }),
    field("Astronomy", "moonrise", "Moonrise", { type: "time", ...almanac }),
    field("Astronomy", "moonset", "Moonset", { type: "time", ...almanac }),
    field("Astronomy", "moonPhase", "Moon phase", {
      options: MOON_PHASES,
      ...almanac,
    }),
    field("Astronomy", "moonPhaseDate", "Next principal phase date", {
      type: "date",
      ...almanac,
    }),
  ];
}
/** Fields a later automatic source (almanac, tide table, NHC) may fill. */
export function fillableFields(kind: ProductKind, source: FillSource) {
  return productFields(kind).filter((f) => f.fillFrom === source);
}
/**
 * Standardized Precipitation Index categories, driest to wettest (US Drought
 * Monitor / CariCOF wording). Mirrored in `wxproducts/climate.py`.
 */
export const SPI_CATEGORIES = [
  "Exceptionally Dry",
  "Extremely Dry",
  "Severely Dry",
  "Moderately Dry",
  "Abnormally Dry",
  "Normal",
  "Abnormally Wet",
  "Moderately Wet",
  "Severely Wet",
  "Extremely Wet",
  "Exceptionally Wet",
] as const;
/** The four SPI rows: windows of 1, 3, 6 and 12 months ending in the month reviewed. */
export const SPI_WINDOWS = [
  { key: "spi1", months: 1 },
  { key: "spi3", months: 3 },
  { key: "spi6", months: 6 },
  { key: "spi12", months: 12 },
] as const;
/** Sector rows of the implications table, in print order. */
export const CLIMATE_SECTOR_IMPACTS = [
  { key: "impactAgriculture", label: "Agriculture" },
  { key: "impactWater", label: "Water" },
  { key: "impactHealth", label: "Health" },
  { key: "impactTourism", label: "Tourism" },
  { key: "impactDrm", label: "Disaster Risk Management" },
  { key: "impactEnergy", label: "Energy" },
  { key: "impactFisheries", label: "Fisheries" },
  { key: "impactInfrastructure", label: "Infrastructure" },
] as const;
/**
 * Looking-back rows: the previous season's outlook against what Point Salines
 * recorded. Observations are typed for now; issue #991 will fill them from the
 * eRegister (as `ClimateFigures` already does for the monitoring month).
 */
export const CLIMATE_VERIFICATION_ROWS = [
  { prefix: "verifyRainfall", label: "Rainfall (mm)" },
  { prefix: "verifyWetDays", label: "Wet days" },
  { prefix: "verifyWetSpell", label: "7-day wet spell" },
  { prefix: "verifyTmax", label: "Tmax (°C)" },
  { prefix: "verifyTmin", label: "Tmin (°C)" },
] as const;
/** `from` and `to` number fields. `minOptional` leaves "from" empty for "up to" ranges. */
function rangeFields(
  section: string,
  prefix: string,
  label: string,
  minOptional = false
): ProductField[] {
  return [
    field(section, `${prefix}Min`, `${label}, from`, {
      type: "number",
      required: !minOptional,
    }),
    field(section, `${prefix}Max`, `${label}, to`, {
      type: "number",
      required: true,
    }),
  ];
}
function outlookRow(
  section: string,
  prefix: string,
  outlookLabel: string,
  rangeLabel: string,
  implication: string,
  minOptional = false
): ProductField[] {
  return [
    field(section, `${prefix}Outlook`, outlookLabel, {
      type: "textarea",
      required: true,
    }),
    ...rangeFields(section, prefix, rangeLabel, minOptional),
    field(section, `${prefix}Implication`, implication, {
      type: "textarea",
      required: true,
    }),
  ];
}
/** Fields of the first Climate Bulletin version; saved revisions may still carry them. */
export const LEGACY_CLIMATE_FIELDS = [
  { key: "summary", label: "Summary of the month" },
  { key: "rainfallComment", label: "Rainfall" },
  { key: "temperatureComment", label: "Temperature" },
  { key: "notableEvents", label: "Notable events" },
  { key: "outlook", label: "Outlook for the coming months" },
] as const;
/**
 * The Grenada National Climate Bulletin (owner examples, issues 08 to 10).
 * Period labels (SPI windows, the season, "looking back") are derived from the
 * month reviewed and the issue date, never typed. Two optional parts cover the
 * layouts that differ between issues: heat stress and extreme heat make the
 * temperature block a table; sector rows or general implications fill the
 * implications block. Empty optional parts stay visible in the editor and are
 * left off the PDF.
 */
function climateBulletinFields(): ProductField[] {
  const spi = "Standardized Precipitation Index";
  const temperature = "Temperature";
  return [
    ...issueFields,
    field("Bulletin", "volume", "Volume", { required: true }),
    field("Bulletin", "issue", "Issue number", { required: true }),
    field("Bulletin", "month", "Month reviewed (YYYY-MM)", { required: true }),
    field(
      "Bulletin",
      "contacts",
      "Contacts for more information (one per line)",
      {
        type: "textarea",
      }
    ),
    field("Climate drivers", "enso", "El Niño-Southern Oscillation (ENSO)", {
      type: "textarea",
      required: true,
    }),
    field("Climate drivers", "sst", "Sea surface temperatures (SSTs)", {
      type: "textarea",
      required: true,
    }),
    ...SPI_WINDOWS.map(({ key, months }) =>
      field(
        spi,
        key,
        months === 1 ? "SPI, month reviewed" : `SPI, ${months} months`,
        { options: SPI_CATEGORIES, required: true }
      )
    ),
    field(
      "Potential evapotranspiration",
      "pet",
      "Potential evapotranspiration (mm/day)",
      {
        type: "number",
        required: true,
      }
    ),
    field(
      "Potential evapotranspiration",
      "petRatio",
      "Atmospheric water demand compared with supply (times)",
      { type: "number", required: true }
    ),
    field("Precipitation outlook", "precipOutlook", "Precipitation outlook", {
      type: "textarea",
      required: true,
    }),
    ...rangeFields(
      "Precipitation outlook",
      "precipRange",
      "Normal range for the season (mm)"
    ),
    ...outlookRow(
      "Wet days",
      "wetDays",
      "Wet days outlook",
      "Usual number of wet days",
      "Implication"
    ),
    ...outlookRow(
      "7-day wet spells (20% wettest)",
      "wetSpells",
      "7-day wet spells outlook",
      "Historical number of 7-day wet spells",
      "Implication"
    ),
    ...outlookRow(
      "Extreme 3-day wet spells (1% wettest)",
      "extremeSpells",
      "Extreme 3-day wet spells outlook",
      "Historical number of extreme 3-day wet spells (leave 'from' empty or 0 for 'up to')",
      "Implication",
      true
    ),
    field(temperature, "tempMeanOutlook", "Mean temperature outlook", {
      type: "textarea",
      required: true,
    }),
    field(
      temperature,
      "tempMaxOutlook",
      "Maximum (daytime) temperature outlook",
      {
        type: "textarea",
        required: true,
      }
    ),
    ...rangeFields(
      temperature,
      "tempMaxRange",
      "Normal maximum temperature (°C)"
    ),
    field(
      temperature,
      "tempMinOutlook",
      "Minimum (night-time) temperature outlook",
      {
        type: "textarea",
        required: true,
      }
    ),
    ...rangeFields(
      temperature,
      "tempMinRange",
      "Normal minimum temperature (°C)"
    ),
    field(
      temperature,
      "heatStress",
      "Potential heat stress (optional; adds the table)"
    ),
    field(
      temperature,
      "extremeHeat",
      "Extreme heat (optional; adds the table)"
    ),
    field("Drought outlook", "droughtOutlook", "Drought outlook", {
      type: "textarea",
      required: true,
    }),
    ...CLIMATE_SECTOR_IMPACTS.map(({ key, label }) =>
      field("Implications by sector", key, label, { type: "textarea" })
    ),
    field(
      "General implications",
      "generalImplications",
      "General implications",
      {
        type: "textarea",
      }
    ),
    ...CLIMATE_VERIFICATION_ROWS.flatMap(({ prefix, label }) => [
      field("Looking back", `${prefix}Outlook`, `${label}, outlook`, {
        required: true,
      }),
      ...rangeFields(
        "Looking back",
        `${prefix}Range`,
        `${label}, normal range`
      ),
      field("Looking back", `${prefix}Observed`, `${label}, observed`, {
        type: "number",
        required: true,
      }),
    ]),
    field("Trivia", "triviaAnswer", "Last month's question and its answer", {
      type: "textarea",
    }),
    field("Trivia", "triviaQuestion", "This month's question, with options", {
      type: "textarea",
    }),
  ];
}
/** `YYYY-MM` of the month before `date` (`YYYY-MM-DD`). */
export function previousMonth(date: string) {
  const [year, month] = date.split("-").map(Number);
  if (!(year && month)) return "";
  const d = new Date(Date.UTC(year, month - 2, 1));
  return d.toISOString().slice(0, 7);
}
/** Climate bulletins are issued on the 15th; the next issue after `date`. */
export function nextClimateIssue(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!(year && month && day)) return "";
  const d = new Date(Date.UTC(year, day < 15 ? month - 1 : month, 15));
  return d.toISOString().slice(0, 10);
}
export const ISSUE_TIMES: Partial<Record<ProductKind, readonly string[]>> = {
  morning: ["07:00"],
  midday: ["12:00"],
  evening: ["18:00"],
  outlook: ["02:00", "08:00", "14:00", "20:00"],
  marine: ["05:00"],
  "marine-forecast": ["05:00"],
};
export function grenadaDate(now = Date.now()) {
  return new Date(now - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function followingDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Forecast issue and coverage boundaries in Grenada local time (UTC−04:00). */
export function forecastSchedule(kind: ProductKind, date: string) {
  if (
    !(isForecastKind(kind) && Number.isFinite(localDateTime(`${date}T07:00`)))
  )
    return null;
  const issuedAt = `${date}T${ISSUE_TIMES[kind]?.[0]}`;
  // The land forecasts end at 07:00; the Marine Forecast runs 05:00 to 05:00.
  const endTime = kind === "marine-forecast" ? "05:00" : "07:00";
  const periods = [
    {
      date,
      prefix: "",
      label: kind === "evening" ? "Tonight" : productTitle(kind),
      validFrom: issuedAt,
      validTo: `${followingDate(date, 1)}T${endTime}`,
    },
  ];
  if (kind === "evening") {
    for (let day = 1; day <= 4; day++) {
      periods.push({
        date: followingDate(date, day),
        prefix: `day${day}`,
        label: `Day ${day}`,
        validFrom: `${followingDate(date, day)}T07:00`,
        validTo: `${followingDate(date, day + 1)}T07:00`,
      });
    }
  }
  return {
    issuedAt,
    validFrom: issuedAt,
    validTo: periods.at(-1)?.validTo ?? `${followingDate(date, 1)}T${endTime}`,
    periods,
  };
}

function forecastValidity(kind: ProductKind) {
  if (kind === "marine-forecast") return MARINE_FORECAST_VALIDITY;
  if (kind === "evening") {
    return "Tonight (18:00–07:00) and four following days (07:00–07:00)";
  }
  if (kind === "morning") {
    return "Today and tonight (07:00–07:00)";
  }
  return "This afternoon and tonight (12:00–07:00)";
}
export function withForecastSchedule(
  kind: ProductKind,
  values: ProductValues
): ProductValues {
  const schedule = forecastSchedule(kind, values.issuedAt?.slice(0, 10) ?? "");
  if (!schedule) return values;
  const result: ProductValues = {
    ...values,
    issuedAt: schedule.issuedAt,
    validFrom: schedule.validFrom,
    validTo: schedule.validTo,
    validity: forecastValidity(kind),
  };
  for (const period of schedule.periods) {
    if (period.prefix) result[`${period.prefix}Date`] = period.date;
  }
  return result;
}

/** Legacy forecast assessments remain stored; CAP is the warning source. */
export function isForecastAlertField(field: ProductField) {
  return (
    field.section.endsWith(" impacts") ||
    field.section === "Risk assessment" ||
    ["weatherAlert", "windAlert", "marineAlert"].includes(field.key) ||
    DAY_ALERT_FIELD.test(field.key)
  );
}
/**
 * The evening tonight block shows only the minimum, and sun times belong to
 * each outlook day. The keys stay in the schema so older issues still open.
 */
const EVENING_TONIGHT_HIDDEN = new Set(["maxTemperature", "sunrise", "sunset"]);
/** The morning sheet gives sunset today and sunrise tomorrow instead. */
const MORNING_HIDDEN = new Set(["sunrise", "sunset"]);
export function isHiddenForecastField(kind: ProductKind, field: ProductField) {
  return (
    isForecastKind(kind) &&
    (isForecastAlertField(field) ||
      (kind === "evening" && EVENING_TONIGHT_HIDDEN.has(field.key)) ||
      (kind === "morning" && MORNING_HIDDEN.has(field.key)))
  );
}
export function displayProductFields(kind: ProductKind) {
  return productFields(kind).filter((f) => !isHiddenForecastField(kind, f));
}
const STRUCTURED_SOURCE_KEY =
  /^(day[1-4])?([Ww]eatherType|[Vv]isibility(Min|Max)|[Ww]indDir(From|To)|[Ww]indSpeed(Min|Max)|[Ww]indGust|[Ss]eaState(From|To)|[Ww]aveHeight(Min|Max)|[Ss]well(Dir|Period|Height)|[Tt]ide[1-4](Type|Time|Height))$/u;
/**
 * Fields for reading an issued product (public site, review step): structured
 * wind/sea/tide inputs are shown through the text FastAPI composes from them,
 * and the internal advisories snapshot is never listed.
 */
export function presentationFields(kind: ProductKind) {
  return displayProductFields(kind).filter(
    (f) => f.key !== "advisories" && !STRUCTURED_SOURCE_KEY.test(f.key)
  );
}
export function emptyProduct(
  kind: ProductKind,
  date = grenadaDate(),
  issueTime = ISSUE_TIMES[kind]?.[0] ?? ""
): ProductValues {
  const values: ProductValues = Object.fromEntries(
    productFields(kind).map(({ key }) => [key, ""])
  );
  values.area = "Grenada, Carriacou and Petite Martinique";
  if (kind === "outlook") {
    values.source = "National Hurricane Center (NHC)";
    values.area =
      "Tropical North Atlantic Ocean, Caribbean Sea and Gulf of Mexico";
    values.specialInterest = "10–20°N and 40–65°W";
    if (issueTime) {
      const next = new Date(
        Date.parse(`${date}T${issueTime}:00Z`) + 6 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 16);
      values.nextUpdate = next;
    }
  }
  if (issueTime) {
    values.issuedAt = `${date}T${issueTime}`;
    values.validFrom = values.issuedAt;
  }
  if (isMarineKind(kind)) values.area = MARINE_FORECAST_AREA;
  if (isBulletin(kind)) {
    // GMS alerts are green only; the level is fixed and hidden in the desk.
    values.level = "Green";
    if (values.validFrom) values.validTo = hoursLater(values.validFrom, 24);
  }
  if (kind === "climate-bulletin") {
    values.month = previousMonth(date);
    values.validFrom = values.issuedAt || `${date}T10:00`;
    values.issuedAt = values.validFrom;
    values.validTo = `${nextClimateIssue(followingDate(date, 1))}T23:59`;
    values.validity = "Until the next monthly bulletin";
  }
  if (kind === "evening") {
    for (let day = 1; day <= 4; day++)
      values[`day${day}Date`] = followingDate(date, day);
    values.validity = "Tonight and the following four days";
  }
  return withForecastSchedule(kind, values);
}
/** `YYYY-MM-DDTHH:MM` plus whole hours (Grenada has no daylight saving). */
function hoursLater(local: string, hours: number) {
  const time = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(time)) return "";
  return new Date(time + hours * 3_600_000).toISOString().slice(0, 16);
}
export interface IssuedBulletin {
  id: string;
  kind: ProductKind;
  publishedRevision: number | null;
  values: ProductValues;
}
/**
 * The bulletin number the desk proposes (owner decision 1, #1197): bulletins
 * are numbered per event, like NHC advisories. An event is the run of
 * consecutive issues of one hazard: the newest published issue of this kind
 * continues it unless it was an All clear or had expired by the new issue
 * time, in which case a new event starts at 1. A number that is not a whole
 * number (hand-typed "3A") restarts the count. The forecaster can change it.
 */
export function proposeBulletinNumber(
  kind: ProductKind,
  issuedAt: string,
  products: readonly IssuedBulletin[],
  excludeId?: string
): string {
  const issued = localDateTime(issuedAt);
  if (!Number.isFinite(issued)) return "1";
  // Issues with an unreadable issue or expiry time cannot be placed in an
  // event, so they are left out before comparing and sorting.
  const previous = products
    .map((p) => ({
      p,
      at: localDateTime(p.values.issuedAt ?? ""),
      until: localDateTime(p.values.validTo ?? ""),
    }))
    .filter(
      ({ p, at, until }) =>
        p.kind === kind &&
        p.publishedRevision &&
        p.id !== excludeId &&
        Number.isFinite(at) &&
        Number.isFinite(until) &&
        at <= issued
    )
    .sort((a, b) => b.at - a.at)[0];
  if (!previous) return "1";
  const ended =
    previous.p.values.notice?.trim() === "All clear" || previous.until < issued;
  const last = Number(previous.p.values.bulletinNumber);
  return !ended && Number.isInteger(last) && last > 0 ? String(last + 1) : "1";
}
export const MARINE_FORECAST_VALIDITY = "05:00 today to 05:00 tomorrow";
export const MARINE_FORECAST_AREA =
  "Waters of Grenada, Carriacou and Petite Martinique";
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;
/** Grenada uses UTC−04:00 year round. Reject malformed calendar values. */
export function localDateTime(value: string): number {
  if (!LOCAL_DATE_TIME.test(value)) return Number.NaN;
  const time = Date.parse(`${value}:00-04:00`);
  if (!Number.isFinite(time)) return Number.NaN;
  return new Date(time - 4 * 60 * 60 * 1000).toISOString().slice(0, 16) ===
    value
    ? time
    : Number.NaN;
}
export function isCurrentProduct(product: PublishedProduct, now = Date.now()) {
  const values = withForecastSchedule(product.kind, product.values);
  return (
    Date.parse(product.publishedAt) <= now &&
    localDateTime(values.issuedAt ?? "") <= now &&
    localDateTime(values.validFrom ?? "") <= now &&
    localDateTime(values.validTo ?? "") > now
  );
}
