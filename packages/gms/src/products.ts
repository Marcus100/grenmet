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
  ...BULLETIN_CATEGORIES,
} as const;
export type ProductKind = keyof typeof PRODUCT_KINDS;
export function isForecastKind(kind: ProductKind) {
  return kind === "morning" || kind === "midday" || kind === "evening";
}
export type ProductValues = Record<string, string>;
export interface ProductField {
  key: string;
  label: string;
  options?: readonly string[];
  required?: boolean;
  section: string;
  type?: "text" | "textarea" | "date" | "datetime-local" | "number";
}
export interface ProductContent {
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
const levels = ["Minimal", "Minor", "Significant", "Severe"];
const likelihoods = ["Very low", "Low", "Medium", "High"];
const DAY_ALERT_FIELD = /^day[1-4](Alerts|Impact|Response)$/;
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
function forecastFields(kind: ProductKind): ProductField[] {
  return [
    field(
      "Weather",
      "summary",
      kind === "evening" ? "Tonight's weather" : "Weather summary",
      { type: "textarea", required: true }
    ),
    field("Weather", "weatherAlert", "Weather alert"),
    field("Weather", "maxTemperature", "Maximum temperature (°C)", {
      type: "number",
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
    field("Wind", "wind", "Wind direction, speed and gusts (include units)", {
      required: true,
    }),
    field("Wind", "windAlert", "Wind alert"),
    field(
      "Marine",
      "seaState",
      "Sea state, wave height and swell (include units)",
      { required: true }
    ),
    field("Marine", "marineAlert", "Marine alert"),
    ...["weather", "wind", "marine", "heat", "dust"].flatMap((hazard) => {
      const section = `${hazard[0].toUpperCase()}${hazard.slice(1)} impacts`;
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
    ...astronomy,
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
            field(section, `${prefix}Max`, "Maximum temperature (°C)", {
              type: "number",
              required: true,
            }),
            field(section, `${prefix}Min`, "Minimum temperature (°C)", {
              type: "number",
              required: true,
            }),
            field(section, `${prefix}Wind`, "Wind (include units)", {
              required: true,
            }),
            field(
              section,
              `${prefix}SeaState`,
              "Sea state and swell (include units)",
              { required: true }
            ),
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
            field(section, `${prefix}HighTides`, "High tides (times)"),
            field(section, `${prefix}LowTides`, "Low tides (times)"),
          ];
        }).flat()
      : []),
  ];
}
const hazardDetails: Record<keyof typeof BULLETIN_CATEGORIES, ProductField[]> =
  {
    marine: [
      field("Conditions", "weather", "Weather", {
        type: "textarea",
        required: true,
      }),
      field(
        "Conditions",
        "seaState",
        "Sea state and wave heights (include units)",
        { required: true }
      ),
      field("Conditions", "visibility", "Visibility (include units)", {
        required: true,
      }),
      field(
        "Conditions",
        "wind",
        "Wind direction, speed and gusts (include units)",
        { required: true }
      ),
      ...astronomy,
      field("Astronomy", "moonrise", "Moonrise"),
      field("Astronomy", "moonset", "Moonset"),
      field("Astronomy", "lastMoonPhase", "Last moon phase and date"),
      field("Astronomy", "nextMoonPhase", "Next moon phase and date"),
    ],
    cyclone: [
      field("Conditions", "systemName", "System name / identifier"),
      field("Conditions", "position", "Location / coordinates"),
      field("Conditions", "movement", "Movement (include units)"),
      field("Conditions", "wind", "Maximum winds and gusts (include units)"),
      field("Conditions", "pressure", "Central pressure (hPa)", {
        type: "number",
      }),
      field("Conditions", "track", "Expected track and timing", {
        type: "textarea",
      }),
    ],
    flood: [
      field("Conditions", "rainfall", "Expected rainfall, duration and units"),
      field("Conditions", "flooding", "Flood-prone areas / river conditions", {
        type: "textarea",
      }),
    ],
    thunderstorm: [
      field("Conditions", "storms", "Storm timing, coverage and intensity", {
        type: "textarea",
      }),
      field("Conditions", "hazards", "Lightning, gusts, hail and rainfall", {
        type: "textarea",
      }),
    ],
    wind: [
      field(
        "Conditions",
        "wind",
        "Wind direction, sustained speed and gusts (include units)",
        { required: true }
      ),
    ],
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
      field("Conditions", "dust", "Dust / haze concentration and extent", {
        type: "textarea",
      }),
      field("Conditions", "visibility", "Visibility (include units)"),
    ],
    coastal: [
      field(
        "Conditions",
        "swell",
        "Swell height, period and direction (include units)"
      ),
      field(
        "Conditions",
        "surge",
        "Surge / coastal inundation (include units)"
      ),
      field("Conditions", "tides", "High tides and affected coastlines"),
    ],
    tsunami: [
      field(
        "Conditions",
        "source",
        "Event source / official bulletin reference"
      ),
      field(
        "Conditions",
        "eventTime",
        "Event date and time (include time zone)"
      ),
      field("Conditions", "location", "Event location and magnitude"),
      field(
        "Conditions",
        "arrival",
        "Expected arrival times (include time zone)"
      ),
      field(
        "Conditions",
        "waveHeight",
        "Expected wave heights (include units)"
      ),
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
      field("Outlook", "nextUpdate", "Next update (Grenada)", {
        type: "datetime-local",
        required: true,
      }),
    ];
  if (kind === "morning" || kind === "midday" || kind === "evening")
    return [...issueFields, ...forecastFields(kind)];
  return [
    ...issueFields,
    field("Bulletin", "bulletinNumber", "Bulletin number"),
    field("Bulletin", "level", "Colour level", {
      options:
        kind === "heat"
          ? ["Green", "Yellow", "Orange", "Red"]
          : ["Green", "Yellow", "Amber", "Red"],
      required: true,
    }),
    field("Bulletin", "notice", "Notice type", {
      options:
        kind === "heat"
          ? ["Outlook", "Watch", "Warning", "Information", "All clear"]
          : ["Information", "Advisory", "Watch", "Warning", "All clear"],
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
    field("Impact and response", "nextUpdate", "Next update (Grenada)", {
      type: "datetime-local",
    }),
  ];
}
export const ISSUE_TIMES: Partial<Record<ProductKind, readonly string[]>> = {
  morning: ["07:00"],
  midday: ["12:00"],
  evening: ["18:00"],
  outlook: ["02:00", "08:00", "14:00", "20:00"],
  marine: ["05:00"],
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
  const periods = [
    {
      date,
      prefix: "",
      label: kind === "evening" ? "Tonight" : productTitle(kind),
      validFrom: issuedAt,
      validTo: `${followingDate(date, 1)}T07:00`,
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
    validTo: periods.at(-1)?.validTo ?? `${followingDate(date, 1)}T07:00`,
    periods,
  };
}

export function withForecastSchedule(
  kind: ProductKind,
  values: ProductValues
): ProductValues {
  const schedule = forecastSchedule(kind, values.issuedAt?.slice(0, 10));
  if (!schedule) return values;
  const result: ProductValues = {
    ...values,
    issuedAt: schedule.issuedAt,
    validFrom: schedule.validFrom,
    validTo: schedule.validTo,
    validity:
      kind === "evening"
        ? "Tonight (18:00–07:00) and four following days (07:00–07:00)"
        : kind === "morning"
          ? "Today and tonight (07:00–07:00)"
          : "This afternoon and tonight (12:00–07:00)",
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
export function displayProductFields(kind: ProductKind) {
  return productFields(kind).filter(
    (f) => !(isForecastKind(kind) && isForecastAlertField(f))
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
  if (kind === "evening") {
    for (let day = 1; day <= 4; day++)
      values[`day${day}Date`] = followingDate(date, day);
    values.validity = "Tonight and the following four days";
  }
  return withForecastSchedule(kind, values);
}
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
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
    localDateTime(values.issuedAt) <= now &&
    localDateTime(values.validFrom) <= now &&
    localDateTime(values.validTo) > now
  );
}
