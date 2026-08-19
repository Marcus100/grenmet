/**
 * iwxxm-taf.ts
 * ------------------------------------------------------------
 * Practical TypeScript + JSON Schema model for IWXXM TAF
 * (based on the subset you pasted: TAF, validPeriod, baseForecast,
 * changeForecast groups, MeteorologicalAerodromeForecast, temperature forecasts,
 * and AerodromeForecastChangeIndicator enum).
 *
 * This mirrors the approach from METAR/SPECI: store “flattened IWXXM” as JSON,
 * validate with AJV, keep strong TS types for your Next.js API.
 */

/* ============================================================
 * Knowledge map (what comes before / after)
 * ------------------------------------------------------------
 * Before:
 *  - METAR/SPECI JSON model (your previous file)
 *  - TAF TAC groups (VALID, FM/TL/AT, TEMPO, PROB30/40, NSW, CAVOK)
 *  - JSON Schema refs ($defs) + AJV validation
 *
 * This file:
 *  - TAF report object model (base + change groups)
 *  - Forecast group modeling (phenomenonTime period + changeIndicator)
 *  - Temperature forecast block (TX/TN + time)
 *
 * After:
 *  - Full IWXXM TAF (codelist constraints, NSW semantics, cancel reports)
 *  - Interlinking: “TAF cancels previous TAF” + versioning in DB
 *  - TAC <-> JSON <-> IWXXM XML round-trip tools
 * ============================================================ */

import { z } from "zod";
import type {
  AirportHeliport,
  Extension,
  ISODateTime,
  Measure,
  MeasureOrNil,
  Nil,
  Ref,
} from "./iwxxm-primitives";
import {
  airportHeliportSchema,
  extensionSchema,
  isoDateTimeSchema,
  measureSchema,
  nilSchema,
  refSchema,
} from "./iwxxm-primitives";

/* ============================================================
 * TAF-specific enums
 * ============================================================ */

export type AerodromeForecastChangeIndicator =
  | "BECOMING"
  | "TEMPORARY_FLUCTUATIONS"
  | "FROM"
  | "PROBABILITY_30"
  | "PROBABILITY_30_TEMPORARY_FLUCTUATIONS"
  | "PROBABILITY_40"
  | "PROBABILITY_40_TEMPORARY_FLUCTUATIONS";

/** Relational operator used in visibility in IWXXM */
export type RelationalOperator = "above" | "below";

/* ============================================================
 * Time modeling
 * - XSD uses gml:TimePeriodPropertyType for phenomenonTime (forecast groups)
 * - TAF validPeriod also a period (optional)
 * ============================================================ */

export interface TimePeriod {
  from: ISODateTime;
  until: ISODateTime;
}

/* ============================================================
 * Forecast components (reuse your METAR/SPECI “shapes”)
 * - In the pasted snippet, surfaceWind uses AerodromeSurfaceWindForecastPropertyType.
 *   For DB JSON, the same structure works fine as surface wind in forecasts.
 * ============================================================ */

export interface AerodromeSurfaceWindForecast {
  extension?: Extension[];
  extremeClockwiseWindDirection?: MeasureOrNil; // uom "deg"
  extremeCounterClockwiseWindDirection?: MeasureOrNil; // uom "deg"
  meanWindDirection?: MeasureOrNil; // uom "deg"
  meanWindSpeed: MeasureOrNil; // uom "m/s" or "[kn_i]"
  meanWindSpeedOperator?: RelationalOperator;
  variableWindDirection?: boolean;
  windGustSpeed?: MeasureOrNil; // uom "m/s" or "[kn_i]"
  windGustSpeedOperator?: RelationalOperator;
}

export interface AerodromeCloudLayerForecast {
  amount?: string; // FEW/SCT/BKN/OVC
  baseHeight?: MeasureOrNil; // uom "m" or "[ft_i]"
  cloudType?: string; // CB/TCU
  extension?: Extension[];
}

export interface AerodromeCloudForecast {
  extension?: Extension[];
  layer?: Array<AerodromeCloudLayerForecast | Nil>;
  verticalVisibility?: MeasureOrNil;
}

/** Forecast weather is a codelist in IWXXM */
export type AerodromeForecastWeather = Ref | Nil;

/* ============================================================
 * Temperature forecast block (TX/TN with occurrence times)
 * ============================================================ */

export interface AerodromeAirTemperatureForecast {
  extension?: Extension[];
  maximumAirTemperature: Measure; // uom "Cel"
  maximumAirTemperatureTime: ISODateTime;
  minimumAirTemperature: Measure; // uom "Cel"
  minimumAirTemperatureTime: ISODateTime;
}

/* ============================================================
 * MeteorologicalAerodromeForecast (base or change group)
 * ============================================================ */

export interface MeteorologicalAerodromeForecast {
  /**
   * XSD attribute: required for all forecasts except base conditions.
   * For DB JSON: keep optional, but enforce at app-layer:
   * - baseForecast.changeIndicator MUST be absent
   * - changeForecast.changeIndicator MUST be present
   */
  changeIndicator?: AerodromeForecastChangeIndicator;

  cloud?: AerodromeCloudForecast | Nil;

  /** CAVOK flag; if true, don’t populate visibility/weather/cloud normally */
  cloudAndVisibilityOK?: boolean;

  extension?: Extension[];
  /**
   * XSD: phenomenonTime is gml:TimePeriodPropertyType (required)
   * - For baseForecast, this is typically entire validity.
   * - For changeForecast groups, this corresponds to FM/TL/AT semantics in TAC,
   *   but the schema uses a period. (AT is typically modeled elsewhere in full IWXXM;
   *   your snippet uses TimePeriod; we keep it period for consistency.)
   */
  phenomenonTime: TimePeriod;

  prevailingVisibility?: Measure; // uom "m"
  prevailingVisibilityOperator?: RelationalOperator;

  surfaceWind?: AerodromeSurfaceWindForecast;

  /**
   * XSD: temperature 0..2, but note from docs:
   * AerodromeAirTemperatureForecast is only reported on BASE conditions on a TAF,
   * not on change forecasts. We don’t enforce that here; validate at business layer.
   */
  temperature?: AerodromeAirTemperatureForecast[];

  /** 0..3 */
  weather?: AerodromeForecastWeather[];
}

/* ============================================================
 * TAF Report
 * ============================================================ */

export interface TAFReport {
  aerodrome: AirportHeliport;

  /** prevailing conditions; mandatory except missing/cancelled reports */
  baseForecast?: MeteorologicalAerodromeForecast | Nil;

  /** validPeriod for the cancelled report (if this report cancels a prior one) */
  cancelledReportValidPeriod?: TimePeriod;

  /**
   * changeForecast groups. XSD says “should not normally exceed five”.
   * (Don’t hard-limit in schema unless you want to.)
   */
  changeForecast?: Array<MeteorologicalAerodromeForecast | Nil>;

  /** extension blocks */
  extension?: Extension[];

  /** attribute indicating cancellation report */
  isCancelReport?: boolean;

  issueTime: ISODateTime;

  /** raw strings are gold for auditability */
  raw?: {
    tac?: string;
    iwxxmXml?: string;
    source?: string;
  };
  type: "TAF";

  /** valid time frame for the TAF (optional in XSD) */
  validPeriod?: TimePeriod;
}

/* ============================================================
 * Zod schemas (forms / API validation)
 * ============================================================ */

export const aerodromeForecastChangeIndicatorSchema = z.enum([
  "BECOMING",
  "TEMPORARY_FLUCTUATIONS",
  "FROM",
  "PROBABILITY_30",
  "PROBABILITY_30_TEMPORARY_FLUCTUATIONS",
  "PROBABILITY_40",
  "PROBABILITY_40_TEMPORARY_FLUCTUATIONS",
]);
export const relationalOperatorSchema = z.enum(["above", "below"]);

export const timePeriodSchema = z.object({
  from: isoDateTimeSchema,
  until: isoDateTimeSchema,
});

/** Minimal forecast schema for report-level validation */
export const meteorologicalAerodromeForecastSchema = z.object({
  phenomenonTime: timePeriodSchema,
  changeIndicator: aerodromeForecastChangeIndicatorSchema.optional(),
  prevailingVisibility: measureSchema.optional(),
  prevailingVisibilityOperator: relationalOperatorSchema.optional(),
  surfaceWind: z.record(z.string(), z.unknown()).optional(),
  weather: z.array(z.union([refSchema, nilSchema])).optional(),
  cloud: z.union([z.record(z.string(), z.unknown()), nilSchema]).optional(),
  cloudAndVisibilityOK: z.boolean().optional(),
  temperature: z.array(z.record(z.string(), z.unknown())).optional(),
  extension: z.array(extensionSchema).optional(),
});

const rawReportSchema = z
  .object({
    tac: z.string().optional(),
    iwxxmXml: z.string().optional(),
    source: z.string().optional(),
  })
  .optional();

export const tafReportSchema = z.object({
  type: z.literal("TAF"),
  issueTime: isoDateTimeSchema,
  aerodrome: airportHeliportSchema,
  validPeriod: timePeriodSchema.optional(),
  cancelledReportValidPeriod: timePeriodSchema.optional(),
  baseForecast: z
    .union([meteorologicalAerodromeForecastSchema, nilSchema])
    .optional(),
  changeForecast: z
    .array(z.union([meteorologicalAerodromeForecastSchema, nilSchema]))
    .optional(),
  extension: z.array(extensionSchema).optional(),
  isCancelReport: z.boolean().optional(),
  raw: rawReportSchema,
});

/* ============================================================
 * JSON Schema (AJV-friendly)
 * ============================================================ */

export const IWXXM_TAF_JSON_SCHEMA = {
  $id: "https://weather.gd/schemas/iwxxm/taf/v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "IWXXM TAF (Flattened JSON) - v1",
  type: "object",
  additionalProperties: false,
  required: ["type", "issueTime", "aerodrome"],
  properties: {
    type: { const: "TAF" },
    issueTime: { $ref: "#/$defs/ISODateTime" },
    aerodrome: { $ref: "#/$defs/AirportHeliport" },
    validPeriod: { $ref: "#/$defs/TimePeriod" },
    cancelledReportValidPeriod: { $ref: "#/$defs/TimePeriod" },
    baseForecast: {
      oneOf: [
        { $ref: "#/$defs/MeteorologicalAerodromeForecast" },
        { $ref: "#/$defs/Nil" },
      ],
    },
    changeForecast: {
      type: "array",
      items: {
        oneOf: [
          { $ref: "#/$defs/MeteorologicalAerodromeForecast" },
          { $ref: "#/$defs/Nil" },
        ],
      },
    },
    extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
    isCancelReport: { type: "boolean" },
    raw: { $ref: "#/$defs/ReportRaw" },
  },
  $defs: {
    ISODateTime: { type: "string", format: "date-time" },

    NilReason: {
      anyOf: [
        {
          enum: [
            "nothingOfOperationalSignificance",
            "noSignificantWeather",
            "noSignificantChange",
            "notDetectedByAutoSystem",
            "notObservable",
            "missing",
          ],
        },
        { type: "string" },
      ],
    },

    Nil: {
      type: "object",
      additionalProperties: false,
      required: ["nilReason"],
      properties: {
        nilReason: { $ref: "#/$defs/NilReason" },
        nilReasonDetail: { type: "string" },
        meta: { type: "object", additionalProperties: true },
        ext: { type: "object", additionalProperties: true },
      },
    },

    Measure: {
      type: "object",
      additionalProperties: false,
      required: ["value", "uom"],
      properties: {
        value: { type: "number" },
        uom: { type: "string", minLength: 1 },
      },
    },

    MeasureOrNil: {
      oneOf: [{ $ref: "#/$defs/Measure" }, { $ref: "#/$defs/Nil" }],
    },

    Ref: {
      type: "object",
      additionalProperties: false,
      required: ["href"],
      properties: {
        href: { type: "string", minLength: 1 },
        title: { type: "string" },
      },
    },

    Extension: {
      type: "object",
      additionalProperties: true,
      properties: {
        name: { type: "string" },
        value: {},
        namespace: { type: "string" },
      },
    },

    RelationalOperator: { enum: ["above", "below"] },

    TimePeriod: {
      type: "object",
      additionalProperties: false,
      required: ["from", "until"],
      properties: {
        from: { $ref: "#/$defs/ISODateTime" },
        until: { $ref: "#/$defs/ISODateTime" },
      },
    },

    AirportHeliport: {
      type: "object",
      additionalProperties: false,
      required: ["designator"],
      properties: {
        designator: { type: "string", minLength: 3 },
        name: { type: "string" },
        position: {
          type: "object",
          additionalProperties: false,
          required: ["lat", "lon"],
          properties: {
            lat: { type: "number", minimum: -90, maximum: 90 },
            lon: { type: "number", minimum: -180, maximum: 180 },
            elevM: { type: "number" },
          },
        },
      },
    },

    AerodromeForecastChangeIndicator: {
      enum: [
        "BECOMING",
        "TEMPORARY_FLUCTUATIONS",
        "FROM",
        "PROBABILITY_30",
        "PROBABILITY_30_TEMPORARY_FLUCTUATIONS",
        "PROBABILITY_40",
        "PROBABILITY_40_TEMPORARY_FLUCTUATIONS",
      ],
    },

    AerodromeSurfaceWindForecast: {
      type: "object",
      additionalProperties: false,
      required: ["meanWindSpeed"],
      properties: {
        meanWindDirection: { $ref: "#/$defs/MeasureOrNil" },
        meanWindSpeed: { $ref: "#/$defs/MeasureOrNil" },
        meanWindSpeedOperator: { $ref: "#/$defs/RelationalOperator" },
        windGustSpeed: { $ref: "#/$defs/MeasureOrNil" },
        windGustSpeedOperator: { $ref: "#/$defs/RelationalOperator" },
        extremeClockwiseWindDirection: { $ref: "#/$defs/MeasureOrNil" },
        extremeCounterClockwiseWindDirection: { $ref: "#/$defs/MeasureOrNil" },
        variableWindDirection: { type: "boolean" },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeCloudLayerForecast: {
      type: "object",
      additionalProperties: false,
      properties: {
        amount: { type: "string" },
        baseHeight: { $ref: "#/$defs/MeasureOrNil" },
        cloudType: { type: "string" },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeCloudForecast: {
      type: "object",
      additionalProperties: false,
      properties: {
        verticalVisibility: { $ref: "#/$defs/MeasureOrNil" },
        layer: {
          type: "array",
          maxItems: 4,
          items: {
            oneOf: [
              { $ref: "#/$defs/AerodromeCloudLayerForecast" },
              { $ref: "#/$defs/Nil" },
            ],
          },
        },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeForecastWeather: {
      oneOf: [{ $ref: "#/$defs/Ref" }, { $ref: "#/$defs/Nil" }],
    },

    AerodromeAirTemperatureForecast: {
      type: "object",
      additionalProperties: false,
      required: [
        "maximumAirTemperature",
        "maximumAirTemperatureTime",
        "minimumAirTemperature",
        "minimumAirTemperatureTime",
      ],
      properties: {
        maximumAirTemperature: { $ref: "#/$defs/Measure" },
        maximumAirTemperatureTime: { $ref: "#/$defs/ISODateTime" },
        minimumAirTemperature: { $ref: "#/$defs/Measure" },
        minimumAirTemperatureTime: { $ref: "#/$defs/ISODateTime" },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    MeteorologicalAerodromeForecast: {
      type: "object",
      additionalProperties: false,
      required: ["phenomenonTime"],
      properties: {
        phenomenonTime: { $ref: "#/$defs/TimePeriod" },

        prevailingVisibility: { $ref: "#/$defs/Measure" },
        prevailingVisibilityOperator: { $ref: "#/$defs/RelationalOperator" },

        surfaceWind: { $ref: "#/$defs/AerodromeSurfaceWindForecast" },

        weather: {
          type: "array",
          maxItems: 3,
          items: { $ref: "#/$defs/AerodromeForecastWeather" },
        },

        cloud: {
          oneOf: [
            { $ref: "#/$defs/AerodromeCloudForecast" },
            { $ref: "#/$defs/Nil" },
          ],
        },

        temperature: {
          type: "array",
          maxItems: 2,
          items: { $ref: "#/$defs/AerodromeAirTemperatureForecast" },
        },

        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },

        changeIndicator: { $ref: "#/$defs/AerodromeForecastChangeIndicator" },

        cloudAndVisibilityOK: { type: "boolean" },
      },
    },

    ReportRaw: {
      type: "object",
      additionalProperties: false,
      properties: {
        tac: { type: "string" },
        iwxxmXml: { type: "string" },
        source: { type: "string" },
      },
    },
  },
} as const;

/* ============================================================
 * Example JSON (TAF)
 * ============================================================ */

export const EXAMPLE_TAF_JSON: TAFReport = {
  type: "TAF",
  issueTime: "2026-02-23T12:00:00Z",
  aerodrome: { designator: "TGPY", name: "Maurice Bishop Intl" },
  validPeriod: { from: "2026-02-23T12:00:00Z", until: "2026-02-24T12:00:00Z" },

  baseForecast: {
    phenomenonTime: {
      from: "2026-02-23T12:00:00Z",
      until: "2026-02-24T12:00:00Z",
    },
    cloudAndVisibilityOK: false,
    prevailingVisibility: { value: 8000, uom: "m" },
    surfaceWind: {
      meanWindDirection: { value: 80, uom: "deg" },
      meanWindSpeed: { value: 10, uom: "[kn_i]" },
    },
    weather: [
      {
        href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/SHRA",
        title: "Showers of rain",
      },
    ],
    cloud: {
      layer: [{ amount: "SCT", baseHeight: { value: 600, uom: "m" } }],
    },
    temperature: [
      {
        maximumAirTemperature: { value: 30, uom: "Cel" },
        maximumAirTemperatureTime: "2026-02-23T20:00:00Z",
        minimumAirTemperature: { value: 23, uom: "Cel" },
        minimumAirTemperatureTime: "2026-02-24T10:00:00Z",
      },
    ],
  },

  changeForecast: [
    {
      changeIndicator: "FROM",
      phenomenonTime: {
        from: "2026-02-23T18:00:00Z",
        until: "2026-02-24T12:00:00Z",
      },
      prevailingVisibility: { value: 10_000, uom: "m" },
      prevailingVisibilityOperator: "above",
      cloudAndVisibilityOK: true,
    },
    {
      changeIndicator: "PROBABILITY_30_TEMPORARY_FLUCTUATIONS",
      phenomenonTime: {
        from: "2026-02-23T22:00:00Z",
        until: "2026-02-24T02:00:00Z",
      },
      cloudAndVisibilityOK: false,
      prevailingVisibility: { value: 4000, uom: "m" },
      weather: [
        {
          href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/TSRA",
          title: "Thunderstorm with rain",
        },
      ],
    },
  ],

  raw: {
    tac: "TAF TGPY 231200Z 2312/2412 08010KT 8000 SHRA SCT020 TX30/2320Z TN23/2410Z FM231800Z CAVOK PROB30 TEMPO 2322/2402 4000 TSRA",
    source: "met-office-ops",
  },
};

/* ============================================================
 * Optional: business-rule validator (recommended)
 * ------------------------------------------------------------
 * JSON Schema can validate structure, but TAF has rules like:
 * - baseForecast MUST NOT have changeIndicator
 * - changeForecast groups SHOULD have changeIndicator
 * - temperature blocks should be base-only
 * - if cloudAndVisibilityOK=true then visibility/weather/cloud should be absent
 * Implement these as a separate “semantic validation” function.
 * ============================================================ */

export function validateTafSemantics(taf: TAFReport): string[] {
  const errors: string[] = [];

  const isNil = (x: unknown): x is Nil =>
    x !== null && typeof x === "object" && "nilReason" in x;

  if (
    taf.baseForecast &&
    !isNil(taf.baseForecast) &&
    taf.baseForecast.changeIndicator
  ) {
    errors.push(
      "baseForecast.changeIndicator must be absent (base conditions have no change indicator)."
    );
  }

  if (taf.changeForecast) {
    taf.changeForecast.forEach((grp, i) => {
      if (!(isNil(grp) || grp.changeIndicator)) {
        errors.push(
          `changeForecast[${i}].changeIndicator should be present for change groups.`
        );
      }
      if (!isNil(grp) && grp.temperature && grp.temperature.length > 0) {
        errors.push(
          `changeForecast[${i}].temperature should not be present (temperature is base-only in IWXXM).`
        );
      }
    });
  }

  return errors;
}

// ─── Drizzle ORM table ────────────────────────────────────────────────────────

import { index, pgTable } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/wxproducts/schema/db-helpers";

/** Terminal Aerodrome Forecasts. Encoded as IWXXM. */
export const tafForecasts = pgTable(
  "taf_forecasts",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    aerodromeIcao: t.text().notNull(),
    issueDatetimeUtc: t.timestamp({ withTimezone: true }).notNull(),
    validFrom: t.timestamp({ withTimezone: true }).notNull(),
    validUntil: t.timestamp({ withTimezone: true }).notNull(),
    rawTac: t.text(),
    body: t.jsonb().$type<TAFReport>().notNull(),
    ...timestamps,
  }),
  (table) => [
    index("taf_forecasts_aerodrome_idx").on(table.aerodromeIcao),
    index("taf_forecasts_validity_idx").on(table.validFrom, table.validUntil),
    index("taf_forecasts_issue_datetime_idx").on(table.issueDatetimeUtc),
  ]
);

export type TafForecastRow = typeof tafForecasts.$inferSelect;
export type TafForecastRowInsert = typeof tafForecasts.$inferInsert;
