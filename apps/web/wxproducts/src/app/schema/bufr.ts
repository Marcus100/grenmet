/**
 * bufr_synop_tm307080.ts
 *
 * Purpose:
 *   "Brain" module for storing BUFR SYNOP data (WMO RegTradObs B/C1; TM 307080 / 3-07-080)
 *   into the Grenada Meteorological Service database in a consistent way.
 *
 * Scope:
 *   - Defines BUFR descriptors (subset) used by TM 307080 and common SYNOP needs.
 *   - Defines a canonical, DB-friendly observation model.
 *   - Provides validation + unit normalization helpers.
 *   - Provides "flatteners" to generate DB rows (station, observation, element, cloud layers, etc.)
 *
 * Notes (from your WMO doc):
 *   - SYNOP data category = 000 (Section 1) and sub-category depends on synoptic time. :contentReference[oaicite:4]{index=4}
 *   - Station block+station number must be non-missing. :contentReference[oaicite:5]{index=5}
 *   - Year/Month/Day/Hour/Minute of actual time of observation should be reported. :contentReference[oaicite:6]{index=6}
 *   - Station pressure and MSLP reported in Pa with precision in tens of Pa. :contentReference[oaicite:7]{index=7}
 *   - You may supplement 3-07-080 (or regional sequences) with additional descriptors as needed. :contentReference[oaicite:8]{index=8}
 */

import type { ISODateTimeString, Maybe } from "./primitives";

/* ---------------------------------- */
/*            Core types              */
/* ---------------------------------- */

export type BufrFxy = `${number}-${number}-${number}`; // e.g., "0-10-051"
export type ISO8601 = ISODateTimeString;
export type { Maybe } from "./primitives";

export type Unit =
  | "dimensionless"
  | "code_table"
  | "flag_table"
  | "CCITT_IA5"
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "degree"
  | "degree_true"
  | "m"
  | "Pa"
  | "K"
  | "C"
  | "percent"
  | "mps"
  | "kg_m2"
  | "J_m2"
  | "gpm";

export type ValueKind =
  | "number"
  | "string"
  | "integer"
  | "code_table"
  | "flag_table";

export interface BufrDescriptorDef {
  /** F-X-Y as commonly written in WMO regs (e.g. 0 10 051). Stored as "0-10-51". */
  fxy: BufrFxy;

  /** Expected data shape */
  kind: ValueKind;

  /** Human meaning */
  name: string;

  /** Optional notes / constraints */
  notes?: string;

  /** BUFR scale (e.g. -1 for tens of Pa, 2 for hundredths). */
  scale: number;

  /** Unit and scale as a data contract (scale is what BUFR uses; your ingest might already decode to real units). */
  unit: Unit;
}

/* ---------------------------------- */
/*      Descriptor registry (core)    */
/* ---------------------------------- */

export const D = {
  // Identification
  WMO_BLOCK_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-1",
    name: "WMO block number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes:
      "Must be non-missing for fixed stations. :contentReference[oaicite:9]{index=9}",
  },
  WMO_STATION_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-2",
    name: "WMO station number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes:
      "Must be non-missing for fixed stations. :contentReference[oaicite:10]{index=10}",
  },
  STATION_NAME: <BufrDescriptorDef>{
    fxy: "0-1-15",
    name: "Station or site name",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
  },
  STATION_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-1",
    name: "Type of station (automatic/manned/hybrid)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
  },

  // Time of observation
  YEAR: <BufrDescriptorDef>{
    fxy: "0-4-1",
    name: "Year",
    unit: "year",
    scale: 0,
    kind: "integer",
  },
  MONTH: <BufrDescriptorDef>{
    fxy: "0-4-2",
    name: "Month",
    unit: "month",
    scale: 0,
    kind: "integer",
  },
  DAY: <BufrDescriptorDef>{
    fxy: "0-4-3",
    name: "Day",
    unit: "day",
    scale: 0,
    kind: "integer",
  },
  HOUR: <BufrDescriptorDef>{
    fxy: "0-4-4",
    name: "Hour",
    unit: "hour",
    scale: 0,
    kind: "integer",
  },
  MINUTE: <BufrDescriptorDef>{
    fxy: "0-4-5",
    name: "Minute",
    unit: "minute",
    scale: 0,
    kind: "integer",
    notes:
      "Actual time of observation should be reported; Section 1 time may be used if within 10 min of nearest hour. :contentReference[oaicite:11]{index=11}",
  },

  // Coordinates
  LATITUDE_HA: <BufrDescriptorDef>{
    fxy: "0-5-1",
    name: "Latitude (high accuracy)",
    unit: "degree",
    scale: 5,
    kind: "number",
  },
  LONGITUDE_HA: <BufrDescriptorDef>{
    fxy: "0-6-1",
    name: "Longitude (high accuracy)",
    unit: "degree",
    scale: 5,
    kind: "number",
  },
  STATION_GROUND_MSL: <BufrDescriptorDef>{
    fxy: "0-7-30",
    name: "Height of station ground above mean sea level",
    unit: "m",
    scale: 1,
    kind: "number",
  },
  BAROMETER_MSL: <BufrDescriptorDef>{
    fxy: "0-7-31",
    name: "Height of barometer above mean sea level",
    unit: "m",
    scale: 1,
    kind: "number",
  },

  // Pressure information (3-02-031)
  STATION_PRESSURE: <BufrDescriptorDef>{
    fxy: "0-10-4",
    name: "Pressure at station level",
    unit: "Pa",
    scale: -1,
    kind: "number",
    notes:
      "Report in Pa, precision tens of Pa. :contentReference[oaicite:12]{index=12}",
  },
  MSLP: <BufrDescriptorDef>{
    fxy: "0-10-51",
    name: "Pressure reduced to mean sea level",
    unit: "Pa",
    scale: -1,
    kind: "number",
    notes:
      "Report in Pa, precision tens of Pa. :contentReference[oaicite:13]{index=13}",
  },
  PRESSURE_CHANGE_3H: <BufrDescriptorDef>{
    fxy: "0-10-61",
    name: "3-hour pressure change",
    unit: "Pa",
    scale: -1,
    kind: "number",
  },
  PRESSURE_TENDENCY_CHAR: <BufrDescriptorDef>{
    fxy: "0-10-63",
    name: "Characteristic of pressure tendency",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
  },

  // Temperature/humidity (3-02-032 inside 3-02-035)
  SENSOR_HEIGHT_T: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground",
    unit: "m",
    scale: 2,
    kind: "number",
  },
  AIR_TEMPERATURE: <BufrDescriptorDef>{
    fxy: "0-12-101",
    name: "Air temperature",
    unit: "K",
    scale: 2,
    kind: "number",
  },
  DEWPOINT_TEMPERATURE: <BufrDescriptorDef>{
    fxy: "0-12-103",
    name: "Dewpoint temperature",
    unit: "K",
    scale: 2,
    kind: "number",
  },
  RELATIVE_HUMIDITY: <BufrDescriptorDef>{
    fxy: "0-13-3",
    name: "Relative humidity",
    unit: "percent",
    scale: 0,
    kind: "number",
  },

  // Visibility
  SENSOR_HEIGHT_VIS: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground (visibility)",
    unit: "m",
    scale: 2,
    kind: "number",
  },
  HORIZONTAL_VIS: <BufrDescriptorDef>{
    fxy: "0-20-1",
    name: "Horizontal visibility",
    unit: "m",
    scale: -1,
    kind: "number",
  },

  // Precip past 24h
  PRECIP_24H: <BufrDescriptorDef>{
    fxy: "0-13-23",
    name: "Total precipitation past 24 hours",
    unit: "kg_m2",
    scale: 1,
    kind: "number",
  },

  // Wind (core)
  WIND_DIR: <BufrDescriptorDef>{
    fxy: "0-11-1",
    name: "Wind direction",
    unit: "degree_true",
    scale: 0,
    kind: "number",
  },
  WIND_SPEED: <BufrDescriptorDef>{
    fxy: "0-11-2",
    name: "Wind speed",
    unit: "mps",
    scale: 1,
    kind: "number",
  },

  // Clouds (general)
  CLOUD_COVER_TOTAL: <BufrDescriptorDef>{
    fxy: "0-20-10",
    name: "Cloud cover (total)",
    unit: "percent",
    scale: 0,
    kind: "number",
  },
  VERTICAL_SIGNIFICANCE: <BufrDescriptorDef>{
    fxy: "0-8-2",
    name: "Vertical significance (surface observations)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
  },
  CLOUD_AMOUNT_LOW_MID: <BufrDescriptorDef>{
    fxy: "0-20-11",
    name: "Cloud amount (low/middle or layer amount)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
  },
  CLOUD_BASE_HEIGHT: <BufrDescriptorDef>{
    fxy: "0-20-13",
    name: "Height of base of cloud",
    unit: "m",
    scale: -1,
    kind: "number",
  },
  CLOUD_TYPE: <BufrDescriptorDef>{
    fxy: "0-20-12",
    name: "Cloud type",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
  },
} as const;

export type DescriptorKey = keyof typeof D;

/* ---------------------------------- */
/*        Template: TM 307080         */
/* ---------------------------------- */

export interface BufrTemplateDef {
  description: string;
  /**
   * A simplified “expected groups” list. Real BUFR messages are sequences of descriptors;
   * your decoder will yield the actual descriptors present (some optional).
   */
  expectedGroups: Array<{
    name: string;
    // We store descriptor keys that represent the group’s minimum useful payload
    minKeys: DescriptorKey[];
    notes?: string;
  }>;
  templateId: "TM_307080";
}

export const TM_307080: BufrTemplateDef = {
  templateId: "TM_307080",
  description:
    "BUFR template for synoptic reports from fixed land stations suitable for SYNOP data (3-07-080).",
  expectedGroups: [
    {
      name: "Surface station identification; time; horizontal/vertical coordinates (3-01-090)",
      minKeys: [
        "WMO_BLOCK_NUMBER",
        "WMO_STATION_NUMBER",
        "YEAR",
        "MONTH",
        "DAY",
        "HOUR",
        "MINUTE",
        "LATITUDE_HA",
        "LONGITUDE_HA",
        "STATION_GROUND_MSL",
        "BAROMETER_MSL",
      ],
      notes:
        "Block+station number must be non-missing; time of observation should be included. :contentReference[oaicite:14]{index=14}",
    },
    {
      name: "Pressure information (3-02-031)",
      minKeys: ["STATION_PRESSURE", "MSLP"],
      notes:
        "Station pressure + MSLP reported in Pa with precision tens of Pa. :contentReference[oaicite:15]{index=15}",
    },
    {
      name: "Basic synoptic instantaneous (3-02-035) – temp/humidity, vis, precip-24h, clouds, wind (subset)",
      minKeys: [
        "SENSOR_HEIGHT_T",
        "AIR_TEMPERATURE",
        "DEWPOINT_TEMPERATURE",
        "RELATIVE_HUMIDITY",
        "HORIZONTAL_VIS",
        "PRECIP_24H",
        "CLOUD_COVER_TOTAL",
        "CLOUD_BASE_HEIGHT",
        "WIND_DIR",
        "WIND_SPEED",
      ],
    },
  ],
};

/* ---------------------------------- */
/*    Canonical observation model     */
/* ---------------------------------- */

/**
 * What your ingest pipeline should produce BEFORE calling normalize/flatten:
 * - raw descriptors (fxy) + values (already decoded into SI where possible).
 */
export type DecodedBufrMap = Partial<Record<BufrFxy, Maybe<number | string>>>;

/**
 * Canonical station identity (DB-friendly).
 */
export interface StationIdentity {
  stationName?: Maybe<string>;
  stationType?: Maybe<number>; // code table value
  wmoBlock: number;
  wmoStation: number;
}

/**
 * Canonical observation (single time, single station).
 * You can store this as one row in `obs` plus many rows in `obs_element` tables.
 */
export interface SynopObservation {
  airTemperatureK?: Maybe<number>;
  barometerMslM?: Maybe<number>;
  cloudBaseHeightM?: Maybe<number>;

  /** Clouds (general + lowest base) */
  cloudCoverTotalPct?: Maybe<number>;
  dewpointTemperatureK?: Maybe<number>;

  /** Visibility + precip */
  horizontalVisibilityM?: Maybe<number>;

  /** Coordinates */
  latitudeDeg?: Maybe<number>;
  longitudeDeg?: Maybe<number>;
  mslPressurePa?: Maybe<number>;

  /** observation timestamp in UTC */
  observedAtUtc: ISO8601;
  precip24hKgM2?: Maybe<number>;
  pressureChange3hPa?: Maybe<number>;
  pressureTendencyChar?: Maybe<number>;
  relativeHumidityPct?: Maybe<number>;

  /** Thermo */
  sensorHeightTM?: Maybe<number>;
  station: StationIdentity;
  stationGroundMslM?: Maybe<number>;

  /** Pressures */
  stationPressurePa?: Maybe<number>;

  /** Wind */
  windDirDegTrue?: Maybe<number>;
  windSpeedMps?: Maybe<number>;
}

/* ---------------------------------- */
/*         Utilities / helpers        */
/* ---------------------------------- */

export class BufrError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BufrError";
    this.details = details;
  }
}

export function fxy(f: number, x: number, y: number): BufrFxy {
  return `${f}-${x}-${y}`;
}

export function asNumber(v: unknown): Maybe<number> {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asString(v: unknown): Maybe<string> {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return String(v);
}

export function mustInt(v: Maybe<number>, field: string): number {
  if (v === null) throw new BufrError(`Missing required integer: ${field}`);
  if (!Number.isInteger(v))
    throw new BufrError(`Expected integer for ${field}`, { value: v });
  return v;
}

export function toIsoUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): ISO8601 {
  // month is 1..12
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return d.toISOString();
}

/** Convenience conversions (some decoders already give you K/Pa/etc; keep these for safety). */
export const Units = {
  cToK: (c: number) => c + 273.15,
  kToC: (k: number) => k - 273.15,
  hPaToPa: (hpa: number) => hpa * 100,
  paToHpa: (pa: number) => pa / 100,
};

/* ---------------------------------- */
/*     Normalization (decoded -> model) */
/* ---------------------------------- */

export interface NormalizeOptions {
  /**
   * If your decoder returns pressure as hPa, set to true to convert to Pa.
   * WMO regs are Pa. :contentReference[oaicite:16]{index=16}
   */
  decoderPressureIsHpa?: boolean;
  /**
   * If your BUFR decoder returns Celsius for temperatures, set this true to convert to K.
   * WMO regs describe temp in K in BUFR, but your tooling might differ.
   */
  decoderTempsAreCelsius?: boolean;
}

/**
 * Map descriptor values (DecodedBufrMap) into canonical SynopObservation.
 * This function only uses the descriptor subset defined in D above,
 * but you can extend it with more descriptors as you expand coverage.
 */
export function normalizeSynopTM307080(
  decoded: DecodedBufrMap,
  opts: NormalizeOptions = {}
): SynopObservation {
  // Required station id:
  const wmoBlock = mustInt(
    asNumber(decoded[D.WMO_BLOCK_NUMBER.fxy]),
    "wmoBlock"
  );
  const wmoStation = mustInt(
    asNumber(decoded[D.WMO_STATION_NUMBER.fxy]),
    "wmoStation"
  );

  // Required observation time components (per regs). :contentReference[oaicite:17]{index=17}
  const year = mustInt(asNumber(decoded[D.YEAR.fxy]), "year");
  const month = mustInt(asNumber(decoded[D.MONTH.fxy]), "month");
  const day = mustInt(asNumber(decoded[D.DAY.fxy]), "day");
  const hour = mustInt(asNumber(decoded[D.HOUR.fxy]), "hour");
  const minute = mustInt(asNumber(decoded[D.MINUTE.fxy]), "minute");

  const observedAtUtc = toIsoUtc(year, month, day, hour, minute);

  // Coordinates
  const latitudeDeg = asNumber(decoded[D.LATITUDE_HA.fxy]);
  const longitudeDeg = asNumber(decoded[D.LONGITUDE_HA.fxy]);
  const stationGroundMslM = asNumber(decoded[D.STATION_GROUND_MSL.fxy]);
  const barometerMslM = asNumber(decoded[D.BAROMETER_MSL.fxy]);

  // Pressure (Pa)
  const stationPressureRaw = asNumber(decoded[D.STATION_PRESSURE.fxy]);
  const mslpRaw = asNumber(decoded[D.MSLP.fxy]);
  const pressureChange3hRaw = asNumber(decoded[D.PRESSURE_CHANGE_3H.fxy]);

  let stationPressurePa: Maybe<number> = null;
  if (stationPressureRaw !== null) {
    stationPressurePa = opts.decoderPressureIsHpa
      ? Units.hPaToPa(stationPressureRaw)
      : stationPressureRaw;
  }

  let mslPressurePa: Maybe<number> = null;
  if (mslpRaw !== null) {
    mslPressurePa = opts.decoderPressureIsHpa
      ? Units.hPaToPa(mslpRaw)
      : mslpRaw;
  }

  let pressureChange3hPa: Maybe<number> = null;
  if (pressureChange3hRaw !== null) {
    pressureChange3hPa = opts.decoderPressureIsHpa
      ? Units.hPaToPa(pressureChange3hRaw)
      : pressureChange3hRaw;
  }

  const pressureTendencyChar = asNumber(decoded[D.PRESSURE_TENDENCY_CHAR.fxy]);

  // Thermo
  const sensorHeightTM = asNumber(decoded[D.SENSOR_HEIGHT_T.fxy]);

  const airTRaw = asNumber(decoded[D.AIR_TEMPERATURE.fxy]);
  const dewTRaw = asNumber(decoded[D.DEWPOINT_TEMPERATURE.fxy]);

  let airTemperatureK: Maybe<number> = null;
  if (airTRaw !== null) {
    airTemperatureK = opts.decoderTempsAreCelsius
      ? Units.cToK(airTRaw)
      : airTRaw;
  }

  let dewpointTemperatureK: Maybe<number> = null;
  if (dewTRaw !== null) {
    dewpointTemperatureK = opts.decoderTempsAreCelsius
      ? Units.cToK(dewTRaw)
      : dewTRaw;
  }

  const relativeHumidityPct = asNumber(decoded[D.RELATIVE_HUMIDITY.fxy]);

  // Visibility + precip
  const horizontalVisibilityM = asNumber(decoded[D.HORIZONTAL_VIS.fxy]);
  const precip24hKgM2 = asNumber(decoded[D.PRECIP_24H.fxy]);

  // Wind
  const windDirDegTrue = asNumber(decoded[D.WIND_DIR.fxy]);
  const windSpeedRaw = asNumber(decoded[D.WIND_SPEED.fxy]);
  const windSpeedMps = windSpeedRaw;

  // Clouds
  const cloudCoverTotalPct = asNumber(decoded[D.CLOUD_COVER_TOTAL.fxy]);
  const cloudBaseHeightM = asNumber(decoded[D.CLOUD_BASE_HEIGHT.fxy]);

  const stationName = asString(decoded[D.STATION_NAME.fxy]);
  const stationType = asNumber(decoded[D.STATION_TYPE.fxy]);

  return {
    station: { wmoBlock, wmoStation, stationName, stationType },

    observedAtUtc,

    latitudeDeg,
    longitudeDeg,
    stationGroundMslM,
    barometerMslM,

    stationPressurePa,
    mslPressurePa,
    pressureChange3hPa,
    pressureTendencyChar,

    sensorHeightTM,
    airTemperatureK,
    dewpointTemperatureK,
    relativeHumidityPct,

    horizontalVisibilityM,
    precip24hKgM2,

    windDirDegTrue,
    windSpeedMps,

    cloudCoverTotalPct,
    cloudBaseHeightM,
  };
}

/* ---------------------------------- */
/*        DB row flattening           */
/* ---------------------------------- */

export interface DbStationRow {
  barometer_msl_m: Maybe<number>;
  latitude_deg: Maybe<number>;
  longitude_deg: Maybe<number>;
  name: Maybe<string>;
  station_ground_msl_m: Maybe<number>;
  station_id: string; // e.g. "WMO:TTTTT" or "WMO:BLOCK-STATION"
  type_code: Maybe<number>;
  wmo_block: number;
  wmo_station: number;
}

export interface DbObservationRow {
  obs_id: string; // deterministic id
  observed_at_utc: ISO8601;
  station_id: string;

  // optional metadata for traceability
  template: "TM_307080";
}

export interface DbElementRow {
  element: string; // e.g. "mslp_pa"
  obs_id: string;
  unit: Unit;
  value_num: Maybe<number>;
  value_text: Maybe<string>;
}

export interface FlattenedSynopRows {
  elements: DbElementRow[];
  observation: DbObservationRow;
  station: DbStationRow;
}

export function makeStationId(station: StationIdentity): string {
  // Example: WMO:377-00001 (block-station). You can change format.
  return `WMO:${station.wmoBlock}-${String(station.wmoStation).padStart(5, "0")}`;
}

export function makeObsId(stationId: string, observedAtUtc: ISO8601): string {
  // Deterministic (useful for idempotent upserts)
  return `OBS:${stationId}:${observedAtUtc}`;
}

/**
 * Flatten canonical observation to DB rows.
 * Recommended DB pattern:
 *   - stations (dimension table)
 *   - observations (fact table)
 *   - observation_elements (tall/narrow for flexibility)
 */
export function flattenSynopToDbRows(
  obs: SynopObservation
): FlattenedSynopRows {
  const stationId = makeStationId(obs.station);
  const obsId = makeObsId(stationId, obs.observedAtUtc);

  const station: DbStationRow = {
    station_id: stationId,
    wmo_block: obs.station.wmoBlock,
    wmo_station: obs.station.wmoStation,
    name: obs.station.stationName ?? null,
    type_code: obs.station.stationType ?? null,
    latitude_deg: obs.latitudeDeg ?? null,
    longitude_deg: obs.longitudeDeg ?? null,
    station_ground_msl_m: obs.stationGroundMslM ?? null,
    barometer_msl_m: obs.barometerMslM ?? null,
  };

  const observation: DbObservationRow = {
    obs_id: obsId,
    station_id: stationId,
    observed_at_utc: obs.observedAtUtc,
    template: "TM_307080",
  };

  const elements: DbElementRow[] = [
    {
      obs_id: obsId,
      element: "station_pressure_pa",
      value_num: obs.stationPressurePa ?? null,
      value_text: null,
      unit: "Pa",
    },
    {
      obs_id: obsId,
      element: "mslp_pa",
      value_num: obs.mslPressurePa ?? null,
      value_text: null,
      unit: "Pa",
    },
    {
      obs_id: obsId,
      element: "pressure_change_3h_pa",
      value_num: obs.pressureChange3hPa ?? null,
      value_text: null,
      unit: "Pa",
    },
    {
      obs_id: obsId,
      element: "pressure_tendency_char",
      value_num: obs.pressureTendencyChar ?? null,
      value_text: null,
      unit: "code_table",
    },

    {
      obs_id: obsId,
      element: "sensor_height_t_m",
      value_num: obs.sensorHeightTM ?? null,
      value_text: null,
      unit: "m",
    },
    {
      obs_id: obsId,
      element: "air_temperature_k",
      value_num: obs.airTemperatureK ?? null,
      value_text: null,
      unit: "K",
    },
    {
      obs_id: obsId,
      element: "dewpoint_temperature_k",
      value_num: obs.dewpointTemperatureK ?? null,
      value_text: null,
      unit: "K",
    },
    {
      obs_id: obsId,
      element: "relative_humidity_pct",
      value_num: obs.relativeHumidityPct ?? null,
      value_text: null,
      unit: "percent",
    },

    {
      obs_id: obsId,
      element: "horizontal_visibility_m",
      value_num: obs.horizontalVisibilityM ?? null,
      value_text: null,
      unit: "m",
    },
    {
      obs_id: obsId,
      element: "precip_24h_kg_m2",
      value_num: obs.precip24hKgM2 ?? null,
      value_text: null,
      unit: "kg_m2",
    },

    {
      obs_id: obsId,
      element: "wind_dir_deg_true",
      value_num: obs.windDirDegTrue ?? null,
      value_text: null,
      unit: "degree_true",
    },
    {
      obs_id: obsId,
      element: "wind_speed_mps",
      value_num: obs.windSpeedMps ?? null,
      value_text: null,
      unit: "mps",
    },

    {
      obs_id: obsId,
      element: "cloud_cover_total_pct",
      value_num: obs.cloudCoverTotalPct ?? null,
      value_text: null,
      unit: "percent",
    },
    {
      obs_id: obsId,
      element: "cloud_base_height_m",
      value_num: obs.cloudBaseHeightM ?? null,
      value_text: null,
      unit: "m",
    },
  ];

  return { station, observation, elements };
}

/* ---------------------------------- */
/*      Section 1 / header logic      */
/* ---------------------------------- */

/**
 * SYNOP international data sub-category guidance (WMO regs).
 * Main synoptic times: 00/06/12/18 => 002
 * Intermediate: 03/09/15/21 => 001
 * Other: 000
 * :contentReference[oaicite:18]{index=18}
 */
export function synopInternationalSubCategory(hourUtc: number): 0 | 1 | 2 {
  const main = new Set([0, 6, 12, 18]);
  const inter = new Set([3, 9, 15, 21]);
  if (main.has(hourUtc)) return 2;
  if (inter.has(hourUtc)) return 1;
  return 0;
}

/* ---------------------------------- */
/*      Extensibility / plug-ins      */
/* ---------------------------------- */

/**
 * You WILL need this as Grenada expands beyond the minimal subset:
 * - Additional present/past weather, sunshine, radiation, gusts, cloud layers replication, etc.
 * - National additions or regional sequences.
 *
 * The WMO regs explicitly allow supplementing 3-07-080 (and regional sequences) with extra descriptors. :contentReference[oaicite:19]{index=19}
 */
export interface DescriptorExtension {
  defs: BufrDescriptorDef[];
  /**
   * Optional: map extra descriptors into elements during flattening.
   */
  toElements?: (obsId: string, decoded: DecodedBufrMap) => DbElementRow[];
}

export function buildDescriptorIndex(extra: DescriptorExtension[] = []) {
  const base = Object.values(D).map((d) => [d.fxy, d] as const);
  const added = extra.flatMap((e) => e.defs.map((d) => [d.fxy, d] as const));
  const index = new Map<BufrFxy, BufrDescriptorDef>([...base, ...added]);
  return index;
}
