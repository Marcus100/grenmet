/**
 * iwxxm-metar-speci.ts
 * ------------------------------------------------------------
 * Practical TypeScript + JSON Schema model for IWXXM METAR/SPECI
 * (based on the subset you pasted: METAR/SPECI report, observation,
 * trend forecast, wind/visibility/RVR/cloud/sea/windshear enums, etc.)
 *
 * Goal: let you store IWXXM-ish objects as JSON in your DB, validate them,
 * and keep a clean, typed “brain” for your Next.js backend.
 *
 * Notes / Reality checks:
 * - IWXXM is GML-heavy and uses xlink references, TimeInstantPropertyType,
 *   and many imported types. For database JSON, we usually “flatten”:
 *   use ISO timestamps, and represent GML reference objects as strings or
 *   small objects.
 * - nilReason appears all over IWXXM. Here we model it as a flexible string,
 *   with a few common known values allowed.
 */

/* ============================================================
 * Knowledge map (what comes before / after)
 * ------------------------------------------------------------
 * Before:
 *  - METAR/SPECI TAC basics (groups, units)
 *  - TypeScript unions + discriminated unions
 *  - JSON Schema basics ($id, $ref, oneOf, enums)
 *
 * This file:
 *  - A typed JSON representation of IWXXM METAR/SPECI subset
 *  - A JSON Schema you can use with AJV (or similar) for validation
 *
 * After:
 *  - Full IWXXM coverage: TAF, SIGMET, AIRMET, SPACE WX
 *  - GML feature modeling + xlink:href normalization
 *  - DB design: event sourcing for observations + report generation pipelines
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
  measureOrNilSchema,
  measureSchema,
  nilSchema,
  refSchema,
} from "./iwxxm-primitives";

/* ============================================================
 * Enums from the pasted XSD
 * ============================================================ */

export type ForecastChangeIndicator = "BECOMING" | "TEMPORARY_FLUCTUATIONS";

export type VisualRangeTendency =
  | "UPWARD"
  | "NO_CHANGE"
  | "DOWNWARD"
  | "MISSING_VALUE";

export type TrendForecastTimeIndicator = "AT" | "UNTIL" | "FROM" | "FROM_UNTIL";

/* ============================================================
 * Components: Wind / Visibility / RVR / Cloud / Sea / WindShear
 * ============================================================ */

export interface AerodromeSurfaceWind {
  extension?: Extension[];
  extremeClockwiseWindDirection?: MeasureOrNil; // uom: "deg"
  extremeCounterClockwiseWindDirection?: MeasureOrNil; // uom: "deg"
  meanWindDirection?: MeasureOrNil; // uom: "deg"
  meanWindSpeed: MeasureOrNil; // uom: "m/s" or "[kn_i]"
  meanWindSpeedOperator?: "above" | "below";
  variableWindDirection?: boolean;
  windGustSpeed?: MeasureOrNil; // uom: "m/s" or "[kn_i]"
  windGustSpeedOperator?: "above" | "below";
}

export interface AerodromeHorizontalVisibility {
  extension?: Extension[];
  minimumVisibility?: MeasureOrNil; // uom: "m"
  minimumVisibilityDirection?: MeasureOrNil; // uom: "deg" (cardinal in TAC; store degrees)
  prevailingVisibility: MeasureOrNil; // uom: "m"
  prevailingVisibilityOperator?: "above" | "below";
}

export interface AerodromeRunwayVisualRange {
  extension?: Extension[];
  meanRVR: MeasureOrNil; // uom: "m"
  meanRVROperator?: "above" | "below";
  pastTendency?: VisualRangeTendency;
  runway?: Ref | Nil; // runway designator reference
}

export interface AerodromeWindShear {
  allRunways?: boolean;
  extension?: Extension[];
  runway?: Array<Ref | Nil>; // if omitted + allRunways=true means all runways
}

export interface AerodromeSeaCondition {
  extension?: Extension[];
  seaState?: Ref | Nil; // WMO sea state table reference
  seaSurfaceTemperature: MeasureOrNil; // uom: "Cel"
  significantWaveHeight?: MeasureOrNil; // uom: "m"
}

export interface AerodromeCloudLayer {
  /** e.g. FEW/SCT/BKN/OVC… in TAC; in IWXXM it’s richer; store what you need */
  amount?: string;
  /** height of base, uom "m" or "[ft_i]" depending on your preference */
  baseHeight?: MeasureOrNil;
  /** CB/TCU etc */
  cloudType?: string;
  extension?: Extension[];
}

export interface AerodromeCloud {
  extension?: Extension[];
  layer?: Array<AerodromeCloudLayer | Nil>;
  verticalVisibility?: MeasureOrNil; // uom "m" or "[ft_i]"
}

/** Present weather and recent weather are codelist references in IWXXM */
export type AerodromePresentWeather = Ref; // href to WMO codelist item
export type AerodromeRecentWeather = Ref; // href to WMO codelist item

/* ============================================================
 * Observation + Trend forecast
 * ============================================================ */

export interface MeteorologicalAerodromeObservation {
  airTemperature?: MeasureOrNil; // uom "Cel"
  cloud?: AerodromeCloud | Nil;
  cloudAndVisibilityOK: boolean; // required in XSD
  dewpointTemperature?: MeasureOrNil; // uom "Cel"
  extension?: Extension[];
  presentWeather?: Array<AerodromePresentWeather | Nil>; // 0..3
  qnh?: MeasureOrNil; // uom "hPa"
  recentWeather?: Array<AerodromeRecentWeather | Nil>; // 0..3
  rvr?: Array<AerodromeRunwayVisualRange | Nil>;
  seaCondition?: AerodromeSeaCondition | Nil;
  surfaceWind?: AerodromeSurfaceWind | Nil;
  visibility?: AerodromeHorizontalVisibility | Nil;
  windShear?: AerodromeWindShear | Nil;
}

export interface MeteorologicalAerodromeTrendForecast {
  changeIndicator: ForecastChangeIndicator; // required
  cloud?: AerodromeCloud | Nil;
  cloudAndVisibilityOK?: boolean; // CAVOK

  extension?: Extension[];
  /** In full IWXXM this is an AbstractTimeObject; for DB JSON use ISO or a period */
  phenomenonTime:
    | { kind: "instant"; at: ISODateTime }
    | { kind: "period"; from: ISODateTime; until: ISODateTime };

  prevailingVisibility?: Measure; // uom "m"
  prevailingVisibilityOperator?: "above" | "below";

  surfaceWind?: AerodromeSurfaceWind;

  timeIndicator?: TrendForecastTimeIndicator;
  weather?: Array<Ref | Nil>; // codelist ref(s) in forecast, max 3 in XSD
}

/* ============================================================
 * Reports: shared base for METAR / SPECI
 * ============================================================ */

export interface MeteorologicalAerodromeObservationReportBase {
  /** XSD: aerodrome (iwxxm:AirportHeliportPropertyType) */
  aerodrome: AirportHeliport;

  /** XSD attribute */
  automatedStation?: boolean;

  /** Common extensions */
  extension?: Extension[];

  /** XSD: issueTime (gml:TimeInstantPropertyType) */
  issueTime: ISODateTime;

  /** XSD: observation (minOccurs=0, nillable=true) */
  observation?: MeteorologicalAerodromeObservation | Nil;

  /** XSD: observationTime (gml:TimeInstantPropertyType) */
  observationTime: ISODateTime;

  /** raw source strings (optional but extremely useful in ops) */
  raw?: {
    /** the TAC line you decoded */
    tac?: string;
    /** IWXXM XML if you stored it */
    iwxxmXml?: string;
    /** source feed id, station system, etc */
    source?: string;
  };

  /**
   * XSD: trendForecast (0..unbounded, nillable=true)
   * NOSIG is represented in IWXXM as a missing trendForecast with nilReason = noSignificantChange.
   */
  trendForecast?: Array<MeteorologicalAerodromeTrendForecast | Nil>;
  /** Discriminator for your JSON */
  type: "METAR" | "SPECI";
}

export type METARReport = MeteorologicalAerodromeObservationReportBase & {
  type: "METAR";
};

export type SPECIReport = MeteorologicalAerodromeObservationReportBase & {
  type: "SPECI";
};

export type AerodromeObservationReport = METARReport | SPECIReport;

/* ============================================================
 * Zod schemas (forms / API validation)
 * ------------------------------------------------------------
 * Primary validator for the app; use with react-hook-form + @hookform/resolvers/zod.
 * ============================================================ */

export const forecastChangeIndicatorSchema = z.enum([
  "BECOMING",
  "TEMPORARY_FLUCTUATIONS",
]);
export const visualRangeTendencySchema = z.enum([
  "UPWARD",
  "NO_CHANGE",
  "DOWNWARD",
  "MISSING_VALUE",
]);
export const trendForecastTimeIndicatorSchema = z.enum([
  "AT",
  "UNTIL",
  "FROM",
  "FROM_UNTIL",
]);

const phenomenonTimeSchema = z.union([
  z.object({ kind: z.literal("instant"), at: isoDateTimeSchema }),
  z.object({
    kind: z.literal("period"),
    from: isoDateTimeSchema,
    until: isoDateTimeSchema,
  }),
]);

/** Minimal observation schema for report-level validation */
export const meteorologicalAerodromeObservationSchema = z.object({
  cloudAndVisibilityOK: z.boolean(),
  airTemperature: measureOrNilSchema.optional(),
  dewpointTemperature: measureOrNilSchema.optional(),
  qnh: measureOrNilSchema.optional(),
  surfaceWind: z
    .union([z.record(z.string(), z.unknown()), nilSchema])
    .optional(),
  visibility: z
    .union([z.record(z.string(), z.unknown()), nilSchema])
    .optional(),
  presentWeather: z.array(z.union([refSchema, nilSchema])).optional(),
  recentWeather: z.array(z.union([refSchema, nilSchema])).optional(),
  rvr: z
    .array(z.union([z.record(z.string(), z.unknown()), nilSchema]))
    .optional(),
  cloud: z.union([z.record(z.string(), z.unknown()), nilSchema]).optional(),
  seaCondition: z
    .union([z.record(z.string(), z.unknown()), nilSchema])
    .optional(),
  windShear: z.union([z.record(z.string(), z.unknown()), nilSchema]).optional(),
  extension: z.array(extensionSchema).optional(),
});

/** Minimal trend forecast schema for report-level validation */
export const meteorologicalAerodromeTrendForecastSchema = z.object({
  changeIndicator: forecastChangeIndicatorSchema,
  phenomenonTime: phenomenonTimeSchema,
  timeIndicator: trendForecastTimeIndicatorSchema.optional(),
  prevailingVisibility: measureSchema.optional(),
  prevailingVisibilityOperator: z.enum(["above", "below"]).optional(),
  surfaceWind: z.record(z.string(), z.unknown()).optional(),
  cloud: z.union([z.record(z.string(), z.unknown()), nilSchema]).optional(),
  cloudAndVisibilityOK: z.boolean().optional(),
  weather: z.array(z.union([refSchema, nilSchema])).optional(),
  extension: z.array(extensionSchema).optional(),
});

const reportBaseSchema = z.object({
  type: z.enum(["METAR", "SPECI"]),
  issueTime: isoDateTimeSchema,
  observationTime: isoDateTimeSchema,
  aerodrome: airportHeliportSchema,
  observation: z
    .union([meteorologicalAerodromeObservationSchema, nilSchema])
    .optional(),
  trendForecast: z
    .array(z.union([meteorologicalAerodromeTrendForecastSchema, nilSchema]))
    .optional(),
  automatedStation: z.boolean().optional(),
  extension: z.array(extensionSchema).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const metarReportSchema = reportBaseSchema.and(
  z.object({ type: z.literal("METAR") })
);
export const speciReportSchema = reportBaseSchema.and(
  z.object({ type: z.literal("SPECI") })
);
export const aerodromeObservationReportSchema = z.union([
  metarReportSchema,
  speciReportSchema,
]);

/* ============================================================
 * JSON Schema (AJV-friendly)
 * ------------------------------------------------------------
 * Use with ajv:
 *   const ajv = new Ajv({ allErrors: true });
 *   const validate = ajv.compile(IWXXM_METAR_SPECI_JSON_SCHEMA);
 *   if (!validate(data)) console.log(validate.errors);
 * ============================================================ */

export const IWXXM_METAR_SPECI_JSON_SCHEMA = {
  $id: "https://weather.gd/schemas/iwxxm/metar-speci/v1.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "IWXXM METAR/SPECI (Flattened JSON) - v1",
  type: "object",
  oneOf: [{ $ref: "#/$defs/METARReport" }, { $ref: "#/$defs/SPECIReport" }],
  $defs: {
    ISODateTime: {
      type: "string",
      // not perfect, but helpful
      format: "date-time",
    },

    NilReason: {
      anyOf: [
        {
          enum: [
            "noSignificantChange",
            "nothingOfOperationalSignificance",
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

    ForecastChangeIndicator: {
      enum: ["BECOMING", "TEMPORARY_FLUCTUATIONS"],
    },

    VisualRangeTendency: {
      enum: ["UPWARD", "NO_CHANGE", "DOWNWARD", "MISSING_VALUE"],
    },

    TrendForecastTimeIndicator: {
      enum: ["AT", "UNTIL", "FROM", "FROM_UNTIL"],
    },

    AerodromeSurfaceWind: {
      type: "object",
      additionalProperties: false,
      required: ["meanWindSpeed"],
      properties: {
        meanWindDirection: { $ref: "#/$defs/MeasureOrNil" },
        meanWindSpeed: { $ref: "#/$defs/MeasureOrNil" },
        meanWindSpeedOperator: { enum: ["above", "below"] },
        windGustSpeed: { $ref: "#/$defs/MeasureOrNil" },
        windGustSpeedOperator: { enum: ["above", "below"] },
        extremeClockwiseWindDirection: { $ref: "#/$defs/MeasureOrNil" },
        extremeCounterClockwiseWindDirection: { $ref: "#/$defs/MeasureOrNil" },
        variableWindDirection: { type: "boolean" },
        extension: {
          type: "array",
          items: { $ref: "#/$defs/Extension" },
        },
      },
    },

    AerodromeHorizontalVisibility: {
      type: "object",
      additionalProperties: false,
      required: ["prevailingVisibility"],
      properties: {
        prevailingVisibility: { $ref: "#/$defs/MeasureOrNil" },
        prevailingVisibilityOperator: { enum: ["above", "below"] },
        minimumVisibility: { $ref: "#/$defs/MeasureOrNil" },
        minimumVisibilityDirection: { $ref: "#/$defs/MeasureOrNil" },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeRunwayVisualRange: {
      type: "object",
      additionalProperties: false,
      required: ["meanRVR"],
      properties: {
        runway: { oneOf: [{ $ref: "#/$defs/Ref" }, { $ref: "#/$defs/Nil" }] },
        meanRVR: { $ref: "#/$defs/MeasureOrNil" },
        meanRVROperator: { enum: ["above", "below"] },
        pastTendency: { $ref: "#/$defs/VisualRangeTendency" },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeWindShear: {
      type: "object",
      additionalProperties: false,
      properties: {
        runway: {
          type: "array",
          items: { oneOf: [{ $ref: "#/$defs/Ref" }, { $ref: "#/$defs/Nil" }] },
        },
        allRunways: { type: "boolean" },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeSeaCondition: {
      type: "object",
      additionalProperties: false,
      required: ["seaSurfaceTemperature"],
      properties: {
        seaSurfaceTemperature: { $ref: "#/$defs/MeasureOrNil" },
        significantWaveHeight: { $ref: "#/$defs/MeasureOrNil" },
        seaState: { oneOf: [{ $ref: "#/$defs/Ref" }, { $ref: "#/$defs/Nil" }] },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeCloudLayer: {
      type: "object",
      additionalProperties: false,
      properties: {
        amount: { type: "string" },
        baseHeight: { $ref: "#/$defs/MeasureOrNil" },
        cloudType: { type: "string" },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    AerodromeCloud: {
      type: "object",
      additionalProperties: false,
      properties: {
        verticalVisibility: { $ref: "#/$defs/MeasureOrNil" },
        layer: {
          type: "array",
          maxItems: 4,
          items: {
            oneOf: [
              { $ref: "#/$defs/AerodromeCloudLayer" },
              { $ref: "#/$defs/Nil" },
            ],
          },
        },
        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },
      },
    },

    MeteorologicalAerodromeObservation: {
      type: "object",
      additionalProperties: false,
      required: ["cloudAndVisibilityOK"],
      properties: {
        airTemperature: { $ref: "#/$defs/MeasureOrNil" },
        dewpointTemperature: { $ref: "#/$defs/MeasureOrNil" },
        qnh: { $ref: "#/$defs/MeasureOrNil" },

        surfaceWind: {
          oneOf: [
            { $ref: "#/$defs/AerodromeSurfaceWind" },
            { $ref: "#/$defs/Nil" },
          ],
        },
        visibility: {
          oneOf: [
            { $ref: "#/$defs/AerodromeHorizontalVisibility" },
            { $ref: "#/$defs/Nil" },
          ],
        },

        rvr: {
          type: "array",
          items: {
            oneOf: [
              { $ref: "#/$defs/AerodromeRunwayVisualRange" },
              { $ref: "#/$defs/Nil" },
            ],
          },
        },

        presentWeather: {
          type: "array",
          maxItems: 3,
          items: { oneOf: [{ $ref: "#/$defs/Ref" }, { $ref: "#/$defs/Nil" }] },
        },

        cloud: {
          oneOf: [{ $ref: "#/$defs/AerodromeCloud" }, { $ref: "#/$defs/Nil" }],
        },

        recentWeather: {
          type: "array",
          maxItems: 3,
          items: { oneOf: [{ $ref: "#/$defs/Ref" }, { $ref: "#/$defs/Nil" }] },
        },

        windShear: {
          oneOf: [
            { $ref: "#/$defs/AerodromeWindShear" },
            { $ref: "#/$defs/Nil" },
          ],
        },

        seaCondition: {
          oneOf: [
            { $ref: "#/$defs/AerodromeSeaCondition" },
            { $ref: "#/$defs/Nil" },
          ],
        },

        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },

        cloudAndVisibilityOK: { type: "boolean" },
      },
    },

    PhenomenonTime: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "at"],
          properties: {
            kind: { const: "instant" },
            at: { $ref: "#/$defs/ISODateTime" },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "from", "until"],
          properties: {
            kind: { const: "period" },
            from: { $ref: "#/$defs/ISODateTime" },
            until: { $ref: "#/$defs/ISODateTime" },
          },
        },
      ],
    },

    MeteorologicalAerodromeTrendForecast: {
      type: "object",
      additionalProperties: false,
      required: ["phenomenonTime", "changeIndicator"],
      properties: {
        phenomenonTime: { $ref: "#/$defs/PhenomenonTime" },
        timeIndicator: { $ref: "#/$defs/TrendForecastTimeIndicator" },

        prevailingVisibility: { $ref: "#/$defs/Measure" },
        prevailingVisibilityOperator: { enum: ["above", "below"] },

        surfaceWind: { $ref: "#/$defs/AerodromeSurfaceWind" },

        weather: {
          type: "array",
          maxItems: 3,
          items: { oneOf: [{ $ref: "#/$defs/Ref" }, { $ref: "#/$defs/Nil" }] },
        },

        cloud: {
          oneOf: [{ $ref: "#/$defs/AerodromeCloud" }, { $ref: "#/$defs/Nil" }],
        },

        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },

        changeIndicator: { $ref: "#/$defs/ForecastChangeIndicator" },
        cloudAndVisibilityOK: { type: "boolean" },
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

    ReportRaw: {
      type: "object",
      additionalProperties: false,
      properties: {
        tac: { type: "string" },
        iwxxmXml: { type: "string" },
        source: { type: "string" },
      },
    },

    ReportBase: {
      type: "object",
      additionalProperties: false,
      required: ["type", "issueTime", "aerodrome", "observationTime"],
      properties: {
        type: { enum: ["METAR", "SPECI"] },
        issueTime: { $ref: "#/$defs/ISODateTime" },
        aerodrome: { $ref: "#/$defs/AirportHeliport" },
        observationTime: { $ref: "#/$defs/ISODateTime" },

        observation: {
          oneOf: [
            { $ref: "#/$defs/MeteorologicalAerodromeObservation" },
            { $ref: "#/$defs/Nil" },
          ],
        },

        trendForecast: {
          type: "array",
          items: {
            oneOf: [
              { $ref: "#/$defs/MeteorologicalAerodromeTrendForecast" },
              { $ref: "#/$defs/Nil" },
            ],
          },
        },

        automatedStation: { type: "boolean" },

        extension: { type: "array", items: { $ref: "#/$defs/Extension" } },

        raw: { $ref: "#/$defs/ReportRaw" },
      },
    },

    METARReport: {
      allOf: [
        { $ref: "#/$defs/ReportBase" },
        {
          type: "object",
          properties: { type: { const: "METAR" } },
          required: ["type"],
        },
      ],
    },

    SPECIReport: {
      allOf: [
        { $ref: "#/$defs/ReportBase" },
        {
          type: "object",
          properties: { type: { const: "SPECI" } },
          required: ["type"],
        },
      ],
    },
  },
} as const;

/* ============================================================
 * Example JSON (METAR)
 * ============================================================ */

export const EXAMPLE_METAR_JSON: METARReport = {
  type: "METAR",
  issueTime: "2026-02-23T12:00:00Z",
  observationTime: "2026-02-23T12:00:00Z",
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop Intl",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  automatedStation: true,
  observation: {
    cloudAndVisibilityOK: false,
    airTemperature: { value: 27.1, uom: "Cel" },
    dewpointTemperature: { value: 23.4, uom: "Cel" },
    qnh: { value: 1013.2, uom: "hPa" },
    surfaceWind: {
      meanWindDirection: { value: 80, uom: "deg" },
      meanWindSpeed: { value: 8, uom: "[kn_i]" },
      windGustSpeed: { value: 16, uom: "[kn_i]" },
      variableWindDirection: false,
    },
    visibility: {
      prevailingVisibility: { value: 9000, uom: "m" },
    },
    presentWeather: [
      {
        href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/RA",
        title: "Rain",
      },
    ],
    cloud: {
      layer: [
        { amount: "SCT", baseHeight: { value: 600, uom: "m" } },
        {
          amount: "BKN",
          baseHeight: { value: 1500, uom: "m" },
          cloudType: "CB",
        },
      ],
    },
  },
  trendForecast: [
    {
      changeIndicator: "BECOMING",
      phenomenonTime: {
        kind: "period",
        from: "2026-02-23T12:00:00Z",
        until: "2026-02-23T14:00:00Z",
      },
      timeIndicator: "FROM_UNTIL",
      prevailingVisibility: { value: 10_000, uom: "m" },
      prevailingVisibilityOperator: "above",
      cloudAndVisibilityOK: true,
    },
  ],
  raw: {
    tac: "METAR TGPY 231200Z 08008G16KT 9000 RA SCT020 BKN050CB 27/23 Q1013",
    source: "station-feed-1",
  },
};

/* ============================================================
 * Example JSON (NOSIG representation)
 * - In IWXXM, NOSIG is a nil trend forecast with nilReason=noSignificantChange
 * ============================================================ */

export const EXAMPLE_SPECI_NOSIG_JSON: SPECIReport = {
  type: "SPECI",
  issueTime: "2026-02-23T12:25:00Z",
  observationTime: "2026-02-23T12:20:00Z",
  aerodrome: { designator: "TGPY" },
  observation: {
    cloudAndVisibilityOK: true,
    visibility: {
      prevailingVisibility: { value: 10_000, uom: "m" },
      prevailingVisibilityOperator: "above",
    },
  },
  trendForecast: [{ nilReason: "noSignificantChange" }],
  raw: { tac: "SPECI TGPY 231225Z CAVOK NOSIG" },
};

/* ============================================================
 * Practical Next.js validation snippet (AJV)
 * (keep here as reference; you can move it elsewhere)
 * ============================================================ */

// Uncomment if you use AJV in your project:
//
// import Ajv from "ajv";
// import addFormats from "ajv-formats";
//
// export function makeMetarSpeciValidator() {
//   const ajv = new Ajv({ allErrors: true, strict: false });
//   addFormats(ajv);
//   const validate = ajv.compile(IWXXM_METAR_SPECI_JSON_SCHEMA);
//   return validate;
// }
