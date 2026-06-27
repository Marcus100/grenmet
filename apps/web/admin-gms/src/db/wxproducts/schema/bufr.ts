/**
 * bufr.ts
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
 * Notes (from WMO Manual on Codes Vol. I.2 RegTradObs B/C1):
 *   - SYNOP data category = 000 (Section 1); sub-category depends on synoptic time.
 *   - Station block+station number must be non-missing.
 *   - Year/Month/Day/Hour/Minute of actual time of observation shall be reported.
 *   - Station pressure and MSLP in Pa, precision tens of Pa.
 *   - Temperatures in K with precision hundredths of K.
 *   - Regional sequences 3-07-081 to 3-07-086 may supplement 3-07-080.
 *   - Replicated groups (cloud layers, precip periods, radiation periods, gusts)
 *     are caller-decoded; pass via SynopReplicationInputs.
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

  /** Unit as a data contract (scale is what BUFR uses; decoded values are in real units). */
  unit: Unit;
}

/* ---------------------------------- */
/*      Descriptor registry (core)    */
/* ---------------------------------- */

/**
 * Registry of BUFR descriptors used in TM 307080 (SYNOP fixed land station).
 * FXY values match WMO BUFR table notation: F-X-Y.
 * Note: 0-7-32 (sensor height above local ground) appears in multiple sequence
 * contexts (temp/humidity, visibility, precipitation, wind) with different semantic
 * roles; separate keys document each role while sharing the same FXY.
 */
export const D = {
  // ── Identification (3-01-004 inside 3-01-090) ──────────────────────────────
  WMO_BLOCK_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-1",
    name: "WMO block number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Must be non-missing for fixed stations (B/C1.2.1).",
  },
  WMO_STATION_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-2",
    name: "WMO station number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Must be non-missing for fixed stations (B/C1.2.1).",
  },
  STATION_NAME: <BufrDescriptorDef>{
    fxy: "0-1-15",
    name: "Station or site name",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "Max 20 characters per WMO-No. 9 Vol. A.",
  },
  STATION_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-1",
    name: "Type of station (automatic/manned/hybrid)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "0=Automatic, 1=Manned, 2=Hybrid.",
  },

  // ── Time of observation (3-01-011 / 3-01-012 inside 3-01-090) ─────────────
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
      "Actual observation time; Section 1 time may substitute if within 10 min (B/C1.2.2.1).",
  },

  // ── Generic time period descriptors (used by period data groups) ───────────
  /** 0-4-24: time period in hours (negative = preceding hours). Used by precip, sunshine, radiation, evaporation, extreme temps, past weather. */
  TIME_PERIOD_HOURS: <BufrDescriptorDef>{
    fxy: "0-4-24",
    name: "Time period or displacement (hours)",
    unit: "hour",
    scale: 0,
    kind: "integer",
    notes: "Negative value = period preceding observation.",
  },
  /** 0-4-25: time period in minutes (negative = preceding minutes). Used by wind, gusts. */
  TIME_PERIOD_MINUTES: <BufrDescriptorDef>{
    fxy: "0-4-25",
    name: "Time period or displacement (minutes)",
    unit: "minute",
    scale: 0,
    kind: "integer",
    notes: "Negative value = period preceding observation.",
  },
  /** 0-8-21: time significance qualifier. Set to 2 = Time averaged (used before wind), missing to cancel. */
  TIME_SIGNIFICANCE: <BufrDescriptorDef>{
    fxy: "0-8-21",
    name: "Time significance",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes:
      "Code 2 = Time averaged (precedes mean wind descriptor). Missing cancels.",
  },

  // ── Horizontal and vertical coordinates (3-01-021 inside 3-01-090) ─────────
  LATITUDE_HA: <BufrDescriptorDef>{
    fxy: "0-5-1",
    name: "Latitude (high accuracy)",
    unit: "degree",
    scale: 5,
    kind: "number",
    notes: "Precision 10^-5 degree (B/C1.2.3).",
  },
  LONGITUDE_HA: <BufrDescriptorDef>{
    fxy: "0-6-1",
    name: "Longitude (high accuracy)",
    unit: "degree",
    scale: 5,
    kind: "number",
    notes: "Precision 10^-5 degree (B/C1.2.3).",
  },
  STATION_GROUND_MSL: <BufrDescriptorDef>{
    fxy: "0-7-30",
    name: "Height of station ground above mean sea level",
    unit: "m",
    scale: 1,
    kind: "number",
    notes: "Tenths of metre. Not the aerodrome HA value (B/C1.2.3).",
  },
  BAROMETER_MSL: <BufrDescriptorDef>{
    fxy: "0-7-31",
    name: "Height of barometer above mean sea level",
    unit: "m",
    scale: 1,
    kind: "number",
    notes: "Tenths of metre (B/C1.2.3).",
  },

  // ── Pressure information (3-02-031) ────────────────────────────────────────
  STATION_PRESSURE: <BufrDescriptorDef>{
    fxy: "0-10-4",
    name: "Pressure at station level",
    unit: "Pa",
    scale: -1,
    kind: "number",
    notes:
      "Pa, precision tens of Pa. Must be included for global exchange (B/C1.3.1.1).",
  },
  MSLP: <BufrDescriptorDef>{
    fxy: "0-10-51",
    name: "Pressure reduced to mean sea level",
    unit: "Pa",
    scale: -1,
    kind: "number",
    notes:
      "Pa, precision tens of Pa. Report whenever computable with reasonable accuracy (B/C1.3.2.1).",
  },
  PRESSURE_CHANGE_3H: <BufrDescriptorDef>{
    fxy: "0-10-61",
    name: "3-hour pressure change",
    unit: "Pa",
    scale: -1,
    kind: "number",
    notes: "Positive, zero or negative. Pa, precision tens of Pa (B/C1.3.3).",
  },
  PRESSURE_TENDENCY_CHAR: <BufrDescriptorDef>{
    fxy: "0-10-63",
    name: "Characteristic of pressure tendency",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "AWS fallback: 2=positive, 7=negative, 4=steady (B/C1.3.3.3).",
  },
  PRESSURE_CHANGE_24H: <BufrDescriptorDef>{
    fxy: "0-10-62",
    name: "24-hour pressure change",
    unit: "Pa",
    scale: -1,
    kind: "number",
    notes: "By regional decision (B/C1.3.4).",
  },
  /** Standard isobaric level; paired with 0-10-9 for high-level stations (B/C1.3.5). */
  STANDARD_LEVEL_PRESSURE: <BufrDescriptorDef>{
    fxy: "0-7-4",
    name: "Pressure (standard level)",
    unit: "Pa",
    scale: -1,
    kind: "number",
    notes:
      "Specifies the standard isobaric surface for geopotential height (B/C1.3.5).",
  },
  GEOPOTENTIAL_HEIGHT: <BufrDescriptorDef>{
    fxy: "0-10-9",
    name: "Geopotential height of the standard level",
    unit: "gpm",
    scale: 0,
    kind: "number",
    notes:
      "Geopotential metres. High-level stations use this instead of MSLP (B/C1.3.5.1).",
  },

  // ── Temperature & humidity sensor height (0-7-32, temp/humidity context) ───
  SENSOR_HEIGHT_T: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground (temperature/humidity)",
    unit: "m",
    scale: 2,
    kind: "number",
    notes: "Hundredths of metre (B/C1.4.1.1).",
  },

  // ── Temperature & humidity (3-02-032 inside 3-02-035) ─────────────────────
  AIR_TEMPERATURE: <BufrDescriptorDef>{
    fxy: "0-12-101",
    name: "Air temperature (dry-bulb)",
    unit: "K",
    scale: 2,
    kind: "number",
    notes: "K, hundredths of K. T(K) = t(°C) + 273.15 (B/C1.4.1.2).",
  },
  DEWPOINT_TEMPERATURE: <BufrDescriptorDef>{
    fxy: "0-12-103",
    name: "Dewpoint temperature",
    unit: "K",
    scale: 2,
    kind: "number",
    notes: "K, hundredths of K (B/C1.4.1.3).",
  },
  RELATIVE_HUMIDITY: <BufrDescriptorDef>{
    fxy: "0-13-3",
    name: "Relative humidity",
    unit: "percent",
    scale: 0,
    kind: "number",
    notes: "Report both dewpoint and RH when available (B/C1.4.1.4.1).",
  },

  // ── Visibility sensor height (0-7-32, visibility context) ──────────────────
  SENSOR_HEIGHT_VIS: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground (visibility)",
    unit: "m",
    scale: 2,
    kind: "number",
    notes:
      "Hundredths of metre; use average eye height if human observer (B/C1.4.2.1).",
  },

  // ── Visibility (3-02-033 inside 3-02-035) ──────────────────────────────────
  HORIZONTAL_VIS: <BufrDescriptorDef>{
    fxy: "0-20-1",
    name: "Horizontal visibility",
    unit: "m",
    scale: -1,
    kind: "number",
    notes:
      "Tens of metres. >81900 m → set to 81900. Shortest direction if not uniform (B/C1.4.2.2).",
  },

  // ── Precipitation past 24h sensor height (0-7-32, precip-24h context) ──────
  SENSOR_HEIGHT_PRECIP_24H: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground (precipitation past 24h)",
    unit: "m",
    scale: 2,
    kind: "number",
    notes: "Rain gauge rim height above ground (B/C1.4.3.1).",
  },

  // ── Precipitation past 24h (3-02-034 inside 3-02-035) ─────────────────────
  PRECIP_24H: <BufrDescriptorDef>{
    fxy: "0-13-23",
    name: "Total precipitation past 24 hours",
    unit: "kg_m2",
    scale: 1,
    kind: "number",
    notes:
      "kg/m², tenths. 0.0 if none; -0.1 for trace. Included at least once/day at a main synoptic time (B/C1.4.3.2).",
  },

  // ── General cloud information (3-02-004 inside 3-02-035) ───────────────────
  CLOUD_COVER_TOTAL: <BufrDescriptorDef>{
    fxy: "0-20-10",
    name: "Cloud cover (total)",
    unit: "percent",
    scale: 0,
    kind: "number",
    notes:
      "% of celestial dome. 113 when sky obscured by fog/other phenomena (B/C1.4.4.1).",
  },
  VERTICAL_SIGNIFICANCE: <BufrDescriptorDef>{
    fxy: "0-8-2",
    name: "Vertical significance (surface observations)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes:
      "7=low, 8=middle, 9=high, 5=ceiling, 62=N/A, 63=missing (B/C1.4.4.2).",
  },
  CLOUD_AMOUNT_LOW_MID: <BufrDescriptorDef>{
    fxy: "0-20-11",
    name: "Cloud amount (low or middle clouds / layer amount)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes:
      "Total low cloud amount, or middle if no low clouds present (B/C1.4.4.3).",
  },
  CLOUD_BASE_HEIGHT: <BufrDescriptorDef>{
    fxy: "0-20-13",
    name: "Height of base of cloud",
    unit: "m",
    scale: -1,
    kind: "number",
    notes:
      "Tens of metres above station elevation. Missing if no cloud (B/C1.4.4.4).",
  },
  /** Cloud type — appears 3× in 3-02-004 for CL, CM, CH; and once per cloud layer in 3-02-005. */
  CLOUD_TYPE: <BufrDescriptorDef>{
    fxy: "0-20-12",
    name: "Cloud type",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
  },
  /** Alias for documentation: CL (low cloud type) in 3-02-004. Same FXY as CLOUD_TYPE. */
  CLOUD_TYPE_LOW: <BufrDescriptorDef>{
    fxy: "0-20-12",
    name: "Cloud type (low clouds CL)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Stratocumulus, Stratus, Cumulus, Cumulonimbus genera (B/C1.4.4.5).",
  },
  /** Alias: CM (middle cloud type) in 3-02-004. */
  CLOUD_TYPE_MID: <BufrDescriptorDef>{
    fxy: "0-20-12",
    name: "Cloud type (middle clouds CM)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Altocumulus, Altostratus, Nimbostratus genera (B/C1.4.4.5).",
  },
  /** Alias: CH (high cloud type) in 3-02-004. */
  CLOUD_TYPE_HIGH: <BufrDescriptorDef>{
    fxy: "0-20-12",
    name: "Cloud type (high clouds CH)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Cirrus, Cirrocumulus, Cirrostratus genera (B/C1.4.4.5).",
  },

  // ── Clouds with bases below station level (3-02-036) ───────────────────────
  CLOUD_TOP_HEIGHT: <BufrDescriptorDef>{
    fxy: "0-20-14",
    name: "Height of top of cloud",
    unit: "m",
    scale: -1,
    kind: "number",
    notes:
      "Altitude of upper surface of cloud above MSL, tens of metres (B/C1.5.2.4).",
  },
  CLOUD_TOP_DESC: <BufrDescriptorDef>{
    fxy: "0-20-17",
    name: "Cloud top description",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes:
      "For clouds with bases below and tops above station level (B/C1.5.2.5).",
  },

  // ── Direction of cloud drift (3-02-047) ────────────────────────────────────
  CLOUD_DRIFT_DIR: <BufrDescriptorDef>{
    fxy: "0-20-54",
    name: "True direction from which clouds are moving",
    unit: "degree_true",
    scale: 0,
    kind: "number",
    notes: "DL, DM, DH for low/middle/high in 3 replications. (B/C1.6.2).",
  },

  // ── Direction and elevation of cloud (3-02-048) ────────────────────────────
  BEARING_AZIMUTH: <BufrDescriptorDef>{
    fxy: "0-5-21",
    name: "Bearing or azimuth (cloud direction Da)",
    unit: "degree_true",
    scale: 2,
    kind: "number",
    notes:
      "Report in whole degrees true; hundredths precision available (B/C1.7.1).",
  },
  ELEVATION_ANGLE: <BufrDescriptorDef>{
    fxy: "0-7-21",
    name: "Elevation angle (cloud top eC)",
    unit: "degree",
    scale: 2,
    kind: "number",
    notes:
      "Elevation of cloud top in degrees; whole degrees sufficient (B/C1.7.2).",
  },

  // ── State of ground / snow / ground min temp (3-02-037) ───────────────────
  STATE_OF_GROUND: <BufrDescriptorDef>{
    fxy: "0-20-62",
    name: "State of the ground (with or without snow)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "E or E' (B/C1.8.1).",
  },
  SNOW_DEPTH: <BufrDescriptorDef>{
    fxy: "0-13-13",
    name: "Total snow depth",
    unit: "m",
    scale: 2,
    kind: "number",
    notes:
      "Hundredths of metre. 0.00 if none; -0.01 = little (<0.005 m); -0.02 = discontinuous (B/C1.8.2).",
  },
  GROUND_MIN_TEMP_12H: <BufrDescriptorDef>{
    fxy: "0-12-113",
    name: "Ground minimum temperature, past 12 hours",
    unit: "K",
    scale: 2,
    kind: "number",
    notes:
      "K, hundredths. Period and synoptic hour by regional decision (B/C1.8.3).",
  },

  // ── Present and past weather (3-02-038 inside 3-02-043) ───────────────────
  PRESENT_WEATHER: <BufrDescriptorDef>{
    fxy: "0-20-3",
    name: "Present weather",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes:
      "Code 00–99 (manned) or 100–199 (AWS). 508=no significant wx; 509=no observation (B/C1.10.1).",
  },
  PAST_WEATHER_1: <BufrDescriptorDef>{
    fxy: "0-20-4",
    name: "Past weather (1)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Highest code figure for the past weather period (B/C1.10.1.7.4).",
  },
  PAST_WEATHER_2: <BufrDescriptorDef>{
    fxy: "0-20-5",
    name: "Past weather (2)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes:
      "Second highest code figure; equals W1 if only one type (B/C1.10.1.7.5).",
  },

  // ── Sunshine (3-02-039 inside 3-02-043, replicated ×2) ───────────────────
  TOTAL_SUNSHINE: <BufrDescriptorDef>{
    fxy: "0-14-31",
    name: "Total sunshine duration",
    unit: "minute",
    scale: 0,
    kind: "number",
    notes:
      "Minutes. Replication 1 = previous 1h, replication 2 = previous 24h (B/C1.10.2).",
  },

  // ── Precipitation measurement sensor height (0-7-32, period precip context)
  SENSOR_HEIGHT_PRECIP_PERIOD: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground (precipitation measurement)",
    unit: "m",
    scale: 2,
    kind: "number",
    notes: "Hundredths of metre; rain gauge rim height (B/C1.10.3.1).",
  },

  // ── Precipitation measurement (3-02-040 inside 3-02-043, replicated ×2) ───
  TOTAL_PRECIP: <BufrDescriptorDef>{
    fxy: "0-13-11",
    name: "Total precipitation / total water equivalent",
    unit: "kg_m2",
    scale: 1,
    kind: "number",
    notes: "kg/m², tenths. 0.0 if none; -0.1 for trace (B/C1.10.3.3).",
  },

  // ── Extreme temperature sensor height (0-7-32, extreme temp context) ───────
  SENSOR_HEIGHT_EXTREME_T: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground (extreme temperature)",
    unit: "m",
    scale: 2,
    kind: "number",
    notes: "Hundredths of metre (B/C1.10.4.1).",
  },

  // ── Extreme temperatures (3-02-041 inside 3-02-043) ───────────────────────
  MAX_TEMPERATURE: <BufrDescriptorDef>{
    fxy: "0-12-111",
    name: "Maximum temperature at height and over period specified",
    unit: "K",
    scale: 2,
    kind: "number",
    notes: "K, hundredths. Period determined by regional decision (B/C1.10.4).",
  },
  MIN_TEMPERATURE: <BufrDescriptorDef>{
    fxy: "0-12-112",
    name: "Minimum temperature at height and over period specified",
    unit: "K",
    scale: 2,
    kind: "number",
    notes: "K, hundredths. Period determined by regional decision (B/C1.10.4).",
  },

  // ── Wind sensor height (0-7-32, wind context) ─────────────────────────────
  SENSOR_HEIGHT_WIND: <BufrDescriptorDef>{
    fxy: "0-7-32",
    name: "Height of sensor above local ground (wind)",
    unit: "m",
    scale: 2,
    kind: "number",
    notes: "Hundredths of metre (B/C1.10.5.1).",
  },

  // ── Wind data (3-02-042 inside 3-02-043) ──────────────────────────────────
  WIND_INSTRUMENT_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-2",
    name: "Type of instrumentation for wind measurement",
    unit: "flag_table",
    scale: 0,
    kind: "flag_table",
    notes:
      "Bit1=certified instrument, Bit2=knots, Bit3=km/h; both 0=m/s (B/C1.10.5.2).",
  },
  WIND_DIR: <BufrDescriptorDef>{
    fxy: "0-11-1",
    name: "Wind direction (10-min mean)",
    unit: "degree_true",
    scale: 0,
    kind: "number",
    notes: "Degrees true. 0 = calm or variable (B/C1.10.5.3).",
  },
  WIND_SPEED: <BufrDescriptorDef>{
    fxy: "0-11-2",
    name: "Wind speed (10-min mean)",
    unit: "mps",
    scale: 1,
    kind: "number",
    notes:
      "m/s, tenths. Time period −10 min preceded by time significance 2 (B/C1.10.5.3).",
  },
  MAX_GUST_DIR: <BufrDescriptorDef>{
    fxy: "0-11-43",
    name: "Maximum wind gust direction",
    unit: "degree_true",
    scale: 0,
    kind: "number",
    notes: "Degrees true. Period by regional/national decision (B/C1.10.5.4).",
  },
  MAX_GUST_SPEED: <BufrDescriptorDef>{
    fxy: "0-11-41",
    name: "Maximum wind gust speed",
    unit: "mps",
    scale: 1,
    kind: "number",
    notes: "m/s, tenths. Period by regional/national decision (B/C1.10.5.4).",
  },

  // ── Evaporation data (3-02-044) ────────────────────────────────────────────
  EVAP_INSTRUMENT_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-4",
    name: "Type of instrumentation for evaporation measurement / crop type",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "iE code table 0-02-004 (B/C1.11.2).",
  },
  EVAPORATION: <BufrDescriptorDef>{
    fxy: "0-13-33",
    name: "Evaporation / evapotranspiration",
    unit: "kg_m2",
    scale: 1,
    kind: "number",
    notes: "kg/m², tenths. Previous 24 h at 0000/0600/1200 UTC (B/C1.11.3).",
  },

  // ── Radiation data (3-02-045, replicated ×2 for 1h and 24h) ──────────────
  LW_RADIATION: <BufrDescriptorDef>{
    fxy: "0-14-2",
    name: "Long-wave radiation, integrated over period",
    unit: "J_m2",
    scale: -3,
    kind: "number",
    notes:
      "J/m², thousands. Positive=downward, negative=upward (B/C1.12.2.1a).",
  },
  SW_RADIATION: <BufrDescriptorDef>{
    fxy: "0-14-4",
    name: "Short-wave radiation, integrated over period",
    unit: "J_m2",
    scale: -3,
    kind: "number",
    notes: "J/m², thousands (B/C1.12.2.1b).",
  },
  NET_RADIATION: <BufrDescriptorDef>{
    fxy: "0-14-16",
    name: "Net radiation, integrated over period",
    unit: "J_m2",
    scale: -4,
    kind: "number",
    notes:
      "J/m², ten-thousands. Positive/negative sign retained (B/C1.12.2.1c).",
  },
  GLOBAL_SOLAR_RADIATION: <BufrDescriptorDef>{
    fxy: "0-14-28",
    name: "Global solar radiation (high accuracy), integrated over period",
    unit: "J_m2",
    scale: -2,
    kind: "number",
    notes: "J/m², hundreds (B/C1.12.2.1d).",
  },
  DIFFUSE_SOLAR_RADIATION: <BufrDescriptorDef>{
    fxy: "0-14-29",
    name: "Diffuse solar radiation (high accuracy), integrated over period",
    unit: "J_m2",
    scale: -2,
    kind: "number",
    notes: "J/m², hundreds (B/C1.12.2.1e).",
  },
  DIRECT_SOLAR_RADIATION: <BufrDescriptorDef>{
    fxy: "0-14-30",
    name: "Direct solar radiation (high accuracy), integrated over period",
    unit: "J_m2",
    scale: -2,
    kind: "number",
    notes: "J/m², hundreds (B/C1.12.2.1f).",
  },

  // ── Temperature change (3-02-046) ─────────────────────────────────────────
  TEMPERATURE_CHANGE: <BufrDescriptorDef>{
    fxy: "0-12-49",
    name: "Temperature change over specified period",
    unit: "K",
    scale: 0,
    kind: "number",
    notes:
      "K. Report only if ≥5°C in <30 min (B/C1.13.2.1). Period constructed with two 0-4-24 values.",
  },
} as const;

export type DescriptorKey = keyof typeof D;

/* ---------------------------------- */
/*       BUFR Section Structures      */
/* ---------------------------------- */

/** Section 0 – Indicator section (8 octets, fixed). */
export interface BufrSection0 {
  /** Octet 8: BUFR edition number. */
  editionNumber: number;
  /** Octets 5–7: total length of BUFR message in octets (includes Section 0). */
  totalLengthOctets: number;
}

/** Section 1 – Identification section (variable length). */
export interface BufrSection1 {
  /** Octet 11: data category (Table A code figure). */
  dataCategory: number;
  /** Octet 19: day. */
  day: number;
  /** Octet 20: hour. */
  hour: number;
  /** Octet 12: international data sub-category (Common Code table C–13). */
  internationalSubCategory: number;
  /** Octet 13: local data sub-category (ADP centre-defined). */
  localSubCategory: number;
  /** Octet 15: version number of local tables used to augment master table. */
  localTableVersion: number;
  /** Octet 4: BUFR master table (0 = standard WMO FM 94; 10 = IOC Oceanography). */
  masterTable: number;
  /** Octet 14: BUFR master table version number (Common Code table C–0). */
  masterTableVersion: number;
  /** Octet 21: minute. */
  minute: number;
  /** Octet 18: month. */
  month: number;
  /** Octet 10 bit 1: true = optional section (Section 2) follows. */
  optionalSectionPresent: boolean;
  /** Octets 5–6: originating/generating centre (Common Code table C–11). */
  originatingCentre: number;
  /** Octets 7–8: originating/generating sub-centre (Common Code table C–12). */
  originatingSubCentre: number;
  /** Octet 22: second. */
  second: number;
  /** Octet 9: update sequence number (0 = original). */
  updateSequenceNumber: number;
  /** Octets 16–17: year (4 digits). */
  year: number;
}

/** Section 2 – Optional section (variable; present only when Section1.optionalSectionPresent = true). */
export interface BufrSection2 {
  /** Octets 5+: centre-defined local data. */
  localData: Uint8Array;
}

/** Section 3 – Data description section (variable length). */
export interface BufrSection3 {
  /** Octet 7 bit 2: true = compressed; false = non-compressed. */
  compressedData: boolean;
  /** Octets 8+: data description (F-X-Y descriptors, 2 octets each). */
  descriptors: BufrFxy[];
  /** Octets 5–6: number of data subsets. */
  numberOfSubsets: number;
  /** Octet 7 bit 1: true = observed data; false = other (e.g. NWP output). */
  observedData: boolean;
}

/** Section 4 – Data section (variable length). */
export interface BufrSection4 {
  /** Octets 5+: binary data as defined by Section 3 descriptor sequence. */
  data: Uint8Array;
}

/** Section 5 – End section (4 octets, fixed; ASCII "7777"). */
export interface BufrSection5 {
  readonly endMarker: "7777";
}

/** Complete parsed BUFR message. Section 2 is optional per Section1.optionalSectionPresent. */
export interface BufrMessage {
  section0: BufrSection0;
  section1: BufrSection1;
  section2?: BufrSection2;
  section3: BufrSection3;
  section4: BufrSection4;
  section5: BufrSection5;
}

/* ---------------------------------- */
/*           BUFR Table A             */
/* ---------------------------------- */

/**
 * BUFR Table A – Data category (WMO FM 94).
 * Maps code figure → category description.
 * Code figures 15–19, 33–100, 102–239 are reserved.
 * Code figures 240–254 are for experimental use.
 */
export const BUFR_TABLE_A: Readonly<Record<number, string>> = {
  0: "Surface data – land",
  1: "Surface data – sea",
  2: "Vertical soundings (other than satellite)",
  3: "Vertical soundings (satellite)",
  4: "Single level upper-air data (other than satellite)",
  5: "Single level upper-air data (satellite)",
  6: "Radar data",
  7: "Synoptic features",
  8: "Physical/chemical constituents",
  9: "Dispersal and transport",
  10: "Radiological data",
  11: "BUFR tables, complete replacement or update",
  12: "Surface data (satellite)",
  13: "Forecasts",
  14: "Warnings",
  20: "Status information",
  21: "Radiances (satellite measured)",
  22: "Radar (satellite) but not altimeter and scatterometer",
  23: "Lidar (satellite)",
  24: "Scatterometry (satellite)",
  25: "Altimetry (satellite)",
  26: "Spectrometry (satellite)",
  27: "Gravity measurement (satellite)",
  28: "Precision orbit (satellite)",
  29: "Space environment (satellite)",
  30: "Calibration datasets (satellite)",
  31: "Oceanographic data",
  32: "Lidar (ground-based)",
  101: "Image data (satellite)",
  255: "Other category",
} as const;

/* ---------------------------------- */
/*  BUFR/CREX Table B – Class 00      */
/*  BUFR/CREX table entries           */
/* ---------------------------------- */

export const TABLE_B_CLASS_00 = {
  TABLE_A_ENTRY: <BufrDescriptorDef>{
    fxy: "0-0-1",
    name: "Table A: entry",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  TABLE_A_DESC_LINE1: <BufrDescriptorDef>{
    fxy: "0-0-2",
    name: "Table A: data category description, line 1",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "32-character CCITT IA5; data width 256 bits.",
  },
  TABLE_A_DESC_LINE2: <BufrDescriptorDef>{
    fxy: "0-0-3",
    name: "Table A: data category description, line 2",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "32-character CCITT IA5; data width 256 bits.",
  },
  MASTER_TABLE: <BufrDescriptorDef>{
    fxy: "0-0-4",
    name: "BUFR/CREX Master table",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "2-character CCITT IA5; data width 16 bits.",
  },
  EDITION_NUMBER: <BufrDescriptorDef>{
    fxy: "0-0-5",
    name: "BUFR/CREX edition number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  BUFR_MASTER_TABLE_VERSION: <BufrDescriptorDef>{
    fxy: "0-0-6",
    name: "BUFR Master table version number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "2-character CCITT IA5; data width 16 bits. See Common Code C–0.",
  },
  CREX_MASTER_TABLE_VERSION: <BufrDescriptorDef>{
    fxy: "0-0-7",
    name: "CREX Master table version number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "2-character CCITT IA5; data width 16 bits. See Common Code C–0.",
  },
  BUFR_LOCAL_TABLE_VERSION: <BufrDescriptorDef>{
    fxy: "0-0-8",
    name: "BUFR Local table version number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "2-character CCITT IA5; data width 16 bits.",
  },
  F_DESCRIPTOR: <BufrDescriptorDef>{
    fxy: "0-0-10",
    name: "F descriptor to be added or defined",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "1-character CCITT IA5; data width 8 bits.",
  },
  X_DESCRIPTOR: <BufrDescriptorDef>{
    fxy: "0-0-11",
    name: "X descriptor to be added or defined",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "2-character CCITT IA5; data width 16 bits.",
  },
  Y_DESCRIPTOR: <BufrDescriptorDef>{
    fxy: "0-0-12",
    name: "Y descriptor to be added or defined",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  ELEMENT_NAME_LINE1: <BufrDescriptorDef>{
    fxy: "0-0-13",
    name: "Element name, line 1",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "32-character CCITT IA5; data width 256 bits.",
  },
  ELEMENT_NAME_LINE2: <BufrDescriptorDef>{
    fxy: "0-0-14",
    name: "Element name, line 2",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "32-character CCITT IA5; data width 256 bits.",
  },
  UNITS_NAME: <BufrDescriptorDef>{
    fxy: "0-0-15",
    name: "Units name",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "24-character CCITT IA5; data width 192 bits.",
  },
  UNITS_SCALE_SIGN: <BufrDescriptorDef>{
    fxy: "0-0-16",
    name: "Units scale sign",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "1-character CCITT IA5; data width 8 bits.",
  },
  UNITS_SCALE: <BufrDescriptorDef>{
    fxy: "0-0-17",
    name: "Units scale",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  UNITS_REFERENCE_SIGN: <BufrDescriptorDef>{
    fxy: "0-0-18",
    name: "Units reference sign",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "1-character CCITT IA5; data width 8 bits.",
  },
  UNITS_REFERENCE_VALUE: <BufrDescriptorDef>{
    fxy: "0-0-19",
    name: "Units reference value",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "10-character CCITT IA5; data width 80 bits.",
  },
  ELEMENT_DATA_WIDTH: <BufrDescriptorDef>{
    fxy: "0-0-20",
    name: "Element data width",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  CODE_FIGURE: <BufrDescriptorDef>{
    fxy: "0-0-24",
    name: "Code figure",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  CODE_FIGURE_MEANING: <BufrDescriptorDef>{
    fxy: "0-0-25",
    name: "Code figure meaning",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "62-character CCITT IA5; data width 496 bits.",
  },
  BIT_NUMBER: <BufrDescriptorDef>{
    fxy: "0-0-26",
    name: "Bit number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "6-character CCITT IA5; data width 48 bits.",
  },
  BIT_NUMBER_MEANING: <BufrDescriptorDef>{
    fxy: "0-0-27",
    name: "Bit number meaning",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "62-character CCITT IA5; data width 496 bits.",
  },
  DESCRIPTOR_DEFINING_SEQUENCE: <BufrDescriptorDef>{
    fxy: "0-0-30",
    name: "Descriptor defining sequence",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "6-character CCITT IA5; data width 48 bits.",
  },
} as const;

/* ---------------------------------- */
/*  BUFR/CREX Table B – Class 01      */
/*  Identification                    */
/* ---------------------------------- */

export const TABLE_B_CLASS_01 = {
  AOD_SOURCE: <BufrDescriptorDef>{
    fxy: "0-1-28",
    name: "Aerosol optical depth (AOD) source",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 5 bits.",
  },
  AIRCRAFT_BEACON_ID: <BufrDescriptorDef>{
    fxy: "0-1-60",
    name: "Aircraft reporting point (Beacon identifier)",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  AIRCRAFT_FLIGHT_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-6",
    name: "Aircraft flight number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  AIRCRAFT_REG_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-8",
    name: "Aircraft registration number or other identification",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  AIRCRAFT_TAIL_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-110",
    name: "Aircraft tail number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "6-character CCITT IA5; data width 48 bits.",
  },
  AIRCRAFT_TYPE: <BufrDescriptorDef>{
    fxy: "0-1-9",
    name: "Type of commercial aircraft",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  BALLOON_LOT_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-93",
    name: "Balloon lot number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "12-character CCITT IA5; data width 96 bits.",
  },
  BUOY_PLATFORM_ID: <BufrDescriptorDef>{
    fxy: "0-1-5",
    name: "Buoy/platform identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 17 bits.",
  },
  COORD_REFERENCE_SYSTEM: <BufrDescriptorDef>{
    fxy: "0-1-150",
    name: "Coordinate reference system",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 16 bits.",
  },
  CRUISE_MISSION_ID: <BufrDescriptorDef>{
    fxy: "0-1-115",
    name: "Identifier of the cruise or mission under which the data were collected",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "20-character CCITT IA5; data width 160 bits.",
  },
  DESTINATION_AIRPORT: <BufrDescriptorDef>{
    fxy: "0-1-112",
    name: "Destination airport",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  ELLIPSOID_SEMI_MAJOR: <BufrDescriptorDef>{
    fxy: "0-1-152",
    name: "Semi-major axis of rotation ellipsoid",
    unit: "m",
    scale: 2,
    kind: "number",
    notes: "m scale 2; data width 31 bits.",
  },
  ELLIPSOID_SEMI_MINOR: <BufrDescriptorDef>{
    fxy: "0-1-153",
    name: "Semi-minor axis of rotation ellipsoid",
    unit: "m",
    scale: 2,
    kind: "number",
    notes: "m scale 2; data width 31 bits.",
  },
  ENCRYPTED_SHIP_ID: <BufrDescriptorDef>{
    fxy: "0-1-114",
    name: "Encrypted ship or mobile land station identifier (base64 encoding)",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "44-character CCITT IA5; data width 352 bits.",
  },
  ENSEMBLE_FORECAST_TYPE: <BufrDescriptorDef>{
    fxy: "0-1-92",
    name: "Type of ensemble forecast",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 8 bits.",
  },
  ENSEMBLE_MEMBER_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-91",
    name: "Ensemble member number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 10 bits.",
  },
  ENSEMBLE_PERTURBATION_TECHNIQUE: <BufrDescriptorDef>{
    fxy: "0-1-90",
    name: "Technique for making up initial perturbations",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 8 bits.",
  },
  FEATURE_NAME: <BufrDescriptorDef>{
    fxy: "0-1-22",
    name: "Name of feature",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes:
      '28-character CCITT IA5. Format: "Type – Location" (e.g. "volcano – Popocatepetl").',
  },
  GENERATING_APPLICATION: <BufrDescriptorDef>{
    fxy: "0-1-32",
    name: "Generating application",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Centre-defined code table; data width 8 bits.",
  },
  GFA_SEQ_ID: <BufrDescriptorDef>{
    fxy: "0-1-39",
    name: "Graphical Area Forecast (GFA) sequence identifier",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "5-character CCITT IA5; data width 40 bits.",
  },
  GRID_POINT_ID: <BufrDescriptorDef>{
    fxy: "0-1-124",
    name: "Grid point identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 24 bits.",
  },
  HIGHWAY_DESIGNATOR: <BufrDescriptorDef>{
    fxy: "0-1-105",
    name: "Highway designator",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "5-character CCITT IA5; data width 40 bits.",
  },
  HIGHWAY_POSITION: <BufrDescriptorDef>{
    fxy: "0-1-106",
    name: "Location along highway as indicated by position markers",
    unit: "m",
    scale: -2,
    kind: "number",
    notes: "m scale –2; data width 14 bits.",
  },
  ICAO_LOCATION: <BufrDescriptorDef>{
    fxy: "0-1-63",
    name: "ICAO location indicator",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  ICAO_REGION_ID: <BufrDescriptorDef>{
    fxy: "0-1-65",
    name: "ICAO region identifier",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "32-character CCITT IA5; data width 256 bits.",
  },
  IMO_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-103",
    name: "IMO Number (unique Lloyd's register)",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 24 bits.",
  },
  LIGHT_SOURCE_ID: <BufrDescriptorDef>{
    fxy: "0-1-145",
    name: "Light source identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "number",
    notes:
      "Numeric, ref –8; data width 20 bits. +ve=Hipparcos; 0=Sun; –2=Venus; –4=Mars; –5=Jupiter; –6=Saturn; –7=Moon; –8=Bright limb.",
  },
  LONG_STATION_NAME: <BufrDescriptorDef>{
    fxy: "0-1-19",
    name: "Long station or site name",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "32-character CCITT IA5; data width 256 bits.",
  },
  MSL_REFERENCE_DATUM: <BufrDescriptorDef>{
    fxy: "0-1-151",
    name: "Fixed mean sea-level reference datum",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 12 bits.",
  },
  NATIONAL_STATION_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-102",
    name: "National station number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 30 bits.",
  },
  NUMERICAL_MODEL_ID: <BufrDescriptorDef>{
    fxy: "0-1-30",
    name: "Numerical model identifier",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "16-character CCITT IA5. May include model name and mesh details.",
  },
  OBS_SEQUENCE_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-23",
    name: "Observation sequence number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 9 bits.",
  },
  OBSERVER_ID: <BufrDescriptorDef>{
    fxy: "0-1-95",
    name: "Observer identification",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "4-character CCITT IA5; data width 32 bits.",
  },
  OPERATING_AGENCY: <BufrDescriptorDef>{
    fxy: "0-1-36",
    name: "Agency in charge of operating the observing platform",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 20 bits.",
  },
  ORIG_GEN_CENTRE: <BufrDescriptorDef>{
    fxy: "0-1-33",
    name: "Identification of originating/generating centre",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Common Code table C-1; data width 8 bits. Preferred over 0-01-031.",
  },
  ORIG_GEN_CENTRE_CODE: <BufrDescriptorDef>{
    fxy: "0-1-31",
    name: "Identification of originating/generating centre (deprecated; use 0-01-033)",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 16 bits.",
  },
  ORIG_GEN_CENTRE_FULL: <BufrDescriptorDef>{
    fxy: "0-1-35",
    name: "Originating/generating centre",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Common Code table C-11; data width 16 bits.",
  },
  ORIG_GEN_SUBCENTRE: <BufrDescriptorDef>{
    fxy: "0-1-34",
    name: "Identification of originating/generating sub-centre",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Common Code table C-12; data width 8 bits.",
  },
  ORIGINATION_AIRPORT: <BufrDescriptorDef>{
    fxy: "0-1-111",
    name: "Origination airport",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  PLATFORM_DIRECTION: <BufrDescriptorDef>{
    fxy: "0-1-12",
    name: "Direction of motion of moving observing platform",
    unit: "degree_true",
    scale: 0,
    kind: "number",
    notes:
      "Degrees true; data width 9 bits. 0=calm/variable; 509=unknown (Ds=9).",
  },
  PLATFORM_DRIFT_SPEED: <BufrDescriptorDef>{
    fxy: "0-1-14",
    name: "Platform drift speed (high precision)",
    unit: "mps",
    scale: 2,
    kind: "number",
    notes: "m s⁻¹ scale 2; data width 10 bits.",
  },
  PLATFORM_MANUFACTURER_MODEL: <BufrDescriptorDef>{
    fxy: "0-1-85",
    name: "Observing platform manufacturer's model",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "20-character CCITT IA5; data width 160 bits.",
  },
  PLATFORM_MANUFACTURER_SERIAL: <BufrDescriptorDef>{
    fxy: "0-1-86",
    name: "Observing platform manufacturer's serial number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "32-character CCITT IA5; data width 256 bits.",
  },
  PLATFORM_SPEED: <BufrDescriptorDef>{
    fxy: "0-1-13",
    name: "Speed of motion of moving observing platform",
    unit: "mps",
    scale: 0,
    kind: "number",
    notes: "m s⁻¹; data width 10 bits.",
  },
  PLATFORM_TX_ID_CODE: <BufrDescriptorDef>{
    fxy: "0-1-52",
    name: "Platform transmitter ID",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 3 bits.",
  },
  PLATFORM_TX_ID_NUM: <BufrDescriptorDef>{
    fxy: "0-1-50",
    name: "Platform transmitter ID number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 17 bits.",
  },
  PLATFORM_TX_ID_STR: <BufrDescriptorDef>{
    fxy: "0-1-51",
    name: "Platform transmitter ID number (character)",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "12-character CCITT IA5; data width 96 bits.",
  },
  PLATFORM_VELOCITY_1: <BufrDescriptorDef>{
    fxy: "0-1-41",
    name: "Absolute platform velocity – first component (Earth centre → 0°E equator)",
    unit: "mps",
    scale: 5,
    kind: "number",
    notes: "m s⁻¹ scale 5, ref –1073741824; data width 31 bits.",
  },
  PLATFORM_VELOCITY_2: <BufrDescriptorDef>{
    fxy: "0-1-42",
    name: "Absolute platform velocity – second component (Earth centre → 90°E equator)",
    unit: "mps",
    scale: 5,
    kind: "number",
    notes: "m s⁻¹ scale 5, ref –1073741824; data width 31 bits.",
  },
  PLATFORM_VELOCITY_3: <BufrDescriptorDef>{
    fxy: "0-1-43",
    name: "Absolute platform velocity – third component (Earth centre → north pole)",
    unit: "mps",
    scale: 5,
    kind: "number",
    notes: "m s⁻¹ scale 5, ref –1073741824; data width 31 bits.",
  },
  PROCESSING_CENTRE_ID: <BufrDescriptorDef>{
    fxy: "0-1-40",
    name: "Processing centre ID code",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "6-character CCITT IA5; data width 48 bits.",
  },
  PROFILE_UID: <BufrDescriptorDef>{
    fxy: "0-1-79",
    name: "Unique identifier for the profile",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  RADIOSONDE_ASCENSION_NUM: <BufrDescriptorDef>{
    fxy: "0-1-82",
    name: "Radiosonde ascension number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 14 bits. Sequential number within a year.",
  },
  RADIOSONDE_RELEASE_NUM: <BufrDescriptorDef>{
    fxy: "0-1-83",
    name: "Radiosonde release number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 3 bits. Multiple releases per synoptic period.",
  },
  RADIOSONDE_SERIAL: <BufrDescriptorDef>{
    fxy: "0-1-81",
    name: "Radiosonde serial number",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "20-character CCITT IA5; data width 160 bits.",
  },
  RETRIEVAL_ID: <BufrDescriptorDef>{
    fxy: "0-1-155",
    name: "Retrieval identifier",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 8 bits.",
  },
  RUNWAY_DESIGNATOR: <BufrDescriptorDef>{
    fxy: "0-1-64",
    name: "Runway designator",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "4-character CCITT IA5; data width 32 bits.",
  },
  SATELLITE_ID: <BufrDescriptorDef>{
    fxy: "0-1-7",
    name: "Satellite identifier",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 10 bits.",
  },
  SATELLITE_SUB_ID: <BufrDescriptorDef>{
    fxy: "0-1-16",
    name: "Satellite sub-identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 16 bits.",
  },
  SEA_ICE_FRACTION_SOURCE: <BufrDescriptorDef>{
    fxy: "0-1-38",
    name: "Source of sea-ice fraction",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 5 bits.",
  },
  SENSOR_ID: <BufrDescriptorDef>{
    fxy: "0-1-154",
    name: "Sensor identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 12 bits.",
  },
  SHIP_STATION_ID: <BufrDescriptorDef>{
    fxy: "0-1-11",
    name: "Ship or mobile land station identifier",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "9-character CCITT IA5; data width 72 bits.",
  },
  SHORT_ICAO_LOCATION: <BufrDescriptorDef>{
    fxy: "0-1-62",
    name: "Short ICAO location indicator",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "4-character CCITT IA5; data width 32 bits.",
  },
  SHORT_STATION_NAME: <BufrDescriptorDef>{
    fxy: "0-1-18",
    name: "Short station or site name",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "5-character CCITT IA5; data width 40 bits.",
  },
  SIGMET_SEQ_ID: <BufrDescriptorDef>{
    fxy: "0-1-37",
    name: "SIGMET sequence identifier",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "3-character CCITT IA5; data width 24 bits.",
  },
  SNAPSHOT_ID: <BufrDescriptorDef>{
    fxy: "0-1-144",
    name: "Snapshot identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 31 bits.",
  },
  SOOP_LINE_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-80",
    name: "Ship line number according to SOOP",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "4-character CCITT IA5; data width 32 bits.",
  },
  SSI_SOURCE: <BufrDescriptorDef>{
    fxy: "0-1-29",
    name: "SSI source",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 5 bits.",
  },
  STANDARD_GENERATING_APP: <BufrDescriptorDef>{
    fxy: "0-1-44",
    name: "Standard generating application",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 8 bits.",
  },
  STATE_FEDERAL_ID: <BufrDescriptorDef>{
    fxy: "0-1-104",
    name: "State/federal state identifier",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "4-character CCITT IA5; data width 32 bits.",
  },
  STATE_ID: <BufrDescriptorDef>{
    fxy: "0-1-101",
    name: "State identifier",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 10 bits.",
  },
  STATION_ACQUISITION: <BufrDescriptorDef>{
    fxy: "0-1-96",
    name: "Station acquisition",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "20-character CCITT IA5; data width 160 bits.",
  },
  STATION_NAME: <BufrDescriptorDef>{
    fxy: "0-1-15",
    name: "Station or site name",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "20-character CCITT IA5; data width 160 bits.",
  },
  STATIONARY_BUOY_ID: <BufrDescriptorDef>{
    fxy: "0-1-10",
    name: "Stationary buoy platform identifier (e.g. C-MAN buoys)",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5; data width 64 bits.",
  },
  STORM_ID: <BufrDescriptorDef>{
    fxy: "0-1-25",
    name: "Storm identifier",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes:
      "3-character CCITT IA5. Format: 2-digit seq + basin letter (W/E/C/L/A/B/S/P/F/U/O/T).",
  },
  STORM_ID_LONG: <BufrDescriptorDef>{
    fxy: "0-1-130",
    name: "Storm identifier (long)",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "4-character CCITT IA5; data width 32 bits.",
  },
  SYNOPTIC_FEATURE_ID: <BufrDescriptorDef>{
    fxy: "0-1-21",
    name: "Synoptic feature identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 14 bits.",
  },
  TEMPLATE_VERSION: <BufrDescriptorDef>{
    fxy: "0-1-113",
    name: "Template version number defined by originating centre",
    unit: "dimensionless",
    scale: 1,
    kind: "number",
    notes: "Numeric scale 1; data width 9 bits.",
  },
  TIDE_STATION_ID: <BufrDescriptorDef>{
    fxy: "0-1-75",
    name: "Tide station identification",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "5-character CCITT IA5; data width 40 bits.",
  },
  TSUNAMETER_SEQ_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-53",
    name: "Tsunameter report sequence number triggered by a tsunami event",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 7 bits.",
  },
  UNIQUE_PRODUCT_DEF: <BufrDescriptorDef>{
    fxy: "0-1-99",
    name: "Unique product definition",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "31-character CCITT IA5; data width 248 bits.",
  },
  WBAN_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-94",
    name: "WBAN number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 17 bits.",
  },
  WIGOS_ID_SERIES: <BufrDescriptorDef>{
    fxy: "0-1-125",
    name: "WIGOS identifier series",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 4 bits.",
  },
  WIGOS_ISSUE_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-127",
    name: "WIGOS issue number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 16 bits.",
  },
  WIGOS_ISSUER_OF_ID: <BufrDescriptorDef>{
    fxy: "0-1-126",
    name: "WIGOS issuer of identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 16 bits.",
  },
  WIGOS_LOCAL_ID: <BufrDescriptorDef>{
    fxy: "0-1-128",
    name: "WIGOS local identifier (character)",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "16-character CCITT IA5; data width 128 bits.",
  },
  WMO_BLOCK_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-1",
    name: "WMO block number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 7 bits.",
  },
  WMO_LONG_STORM_NAME: <BufrDescriptorDef>{
    fxy: "0-1-27",
    name: "WMO long storm name",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: '10-character CCITT IA5. Use "Nameless" for unnamed disturbances.',
  },
  WMO_MARINE_PLATFORM_EXTENDED_ID: <BufrDescriptorDef>{
    fxy: "0-1-87",
    name: "WMO marine observing platform extended identifier",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 23 bits.",
  },
  WMO_REGION_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-3",
    name: "WMO Region number/geographical area",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 3 bits.",
  },
  WMO_REGION_SUB_AREA: <BufrDescriptorDef>{
    fxy: "0-1-20",
    name: "WMO Region sub-area",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 4 bits. Supersedes 0-01-004.",
  },
  WMO_REGION_SUB_AREA_LEGACY: <BufrDescriptorDef>{
    fxy: "0-1-4",
    name: "WMO Region sub-area (deprecated; use 0-01-020)",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 3 bits.",
  },
  WMO_STATION_NUMBER: <BufrDescriptorDef>{
    fxy: "0-1-2",
    name: "WMO station number",
    unit: "dimensionless",
    scale: 0,
    kind: "integer",
    notes: "Numeric; data width 10 bits.",
  },
  WMO_STORM_NAME: <BufrDescriptorDef>{
    fxy: "0-1-26",
    name: "WMO storm name (deprecated; use 0-01-027)",
    unit: "CCITT_IA5",
    scale: 0,
    kind: "string",
    notes: "8-character CCITT IA5.",
  },
  WIND_SPEED_SOURCE: <BufrDescriptorDef>{
    fxy: "0-1-24",
    name: "Wind speed source",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 5 bits.",
  },
} as const;

/* ---------------------------------- */
/*  BUFR/CREX Table B – Class 02      */
/*  Instrumentation (partial –        */
/*  spec was truncated at 0-02-006)   */
/* ---------------------------------- */

export const TABLE_B_CLASS_02 = {
  EVAP_INSTRUMENT_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-4",
    name: "Type of instrumentation for evaporation measurement or crop type for evapotranspiration",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 4 bits.",
  },
  MEASURING_EQUIPMENT_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-3",
    name: "Type of measuring equipment used",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 4 bits.",
  },
  TEMPERATURE_PRECISION: <BufrDescriptorDef>{
    fxy: "0-2-5",
    name: "Precision of temperature observation",
    unit: "K",
    scale: 2,
    kind: "number",
    notes: "K scale 2; data width 7 bits.",
  },
  TYPE_OF_STATION: <BufrDescriptorDef>{
    fxy: "0-2-1",
    name: "Type of station",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 2 bits. 0=automatic, 1=manned, 2=hybrid.",
  },
  UPPER_AIR_REMOTE_SENSING_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-6",
    name: "Upper air remote sensing instrument type",
    unit: "code_table",
    scale: 0,
    kind: "code_table",
    notes: "Code table; data width 6 bits.",
  },
  WIND_INSTRUMENT_TYPE: <BufrDescriptorDef>{
    fxy: "0-2-2",
    name: "Type of instrumentation for wind measurement",
    unit: "flag_table",
    scale: 0,
    kind: "flag_table",
    notes:
      "Flag table; data width 4 bits. Bit1=certified, Bit2=knots, Bit3=km/h.",
  },
} as const;

/* ---------------------------------- */
/*  Replicated group sub-types        */
/* ---------------------------------- */

/**
 * One replicated entry from sequence 3-02-005 (individual cloud layer).
 * Up to 4 entries per SYNOP (3 non-Cb + 1 Cb); from lower to higher levels (B/C1.4.5.1.1).
 */
export interface IndividualCloudLayer {
  /** 0-20-13: height of cloud base above station elevation, metres (tens of metres). */
  baseHeightM: Maybe<number>;
  /** 0-20-11: amount in oktas (code table). */
  cloudAmount: Maybe<number>;
  /** 0-20-12: cloud type code. 59=type indiscernible (obscured). 63=missing. */
  cloudType: Maybe<number>;
  /** 0-8-2: 1=1st non-Cb, 2=2nd non-Cb, 3=3rd non-Cb, 4=Cb, 5=ceiling, 20=no cloud (AWS), 21–24=AWS layers, 63=missing. */
  verticalSignificance: Maybe<number>;
}

/**
 * One replicated entry from sequence 3-02-036 (cloud with base below station level).
 * Vertical significance 10 = base below, tops above station; 11 = base and tops below station (B/C1.5.2.1).
 */
export interface CloudBelowStation {
  /** 0-20-11: cloud amount (oktas code table). */
  cloudAmount: Maybe<number>;
  /** 0-20-12: cloud type. */
  cloudType: Maybe<number>;
  /** 0-20-17: cloud top description code table. */
  topDescription: Maybe<number>;
  /** 0-20-14: altitude of upper surface of cloud above MSL, metres. */
  topHeightMslM: Maybe<number>;
  /** 0-8-2: 10 = base below + tops above; 11 = base and tops below. */
  verticalSignificance: Maybe<number>;
}

/**
 * One entry from the 3-replicated sequence 3-02-047 (cloud drift direction).
 * Three entries always present: low (vertSig=7), middle (8), high (9).
 */
export interface CloudDriftEntry {
  /** 0-20-54: true direction clouds are moving FROM, degrees. Missing if not observed. */
  directionDegTrue: Maybe<number>;
  /** 0-8-2: 7=low, 8=middle, 9=high. */
  verticalSignificance: 7 | 8 | 9;
}

/**
 * Cloud direction and elevation entry from 3-02-048 (one per orographic/vertical-development cloud).
 * Required mainly for tropical land stations (B/C1.7).
 */
export interface CloudElevationEntry {
  /** 0-5-21: bearing or azimuth Da, degrees true. */
  bearingDegTrue: Maybe<number>;
  /** 0-20-12: cloud genus. */
  cloudType: Maybe<number>;
  /** 0-7-21: elevation angle eC of cloud top, degrees. */
  elevationDeg: Maybe<number>;
}

/**
 * One entry from 3-02-039, replicated ×2 (1h and 24h sunshine).
 */
export interface SunshinePeriod {
  /** 0-14-31: sunshine duration in minutes. */
  durationMinutes: Maybe<number>;
  /** 0-4-24: -1 (1-hour) or -24 (24-hour). */
  periodHours: -1 | -24;
}

/**
 * One entry from 3-02-040, replicated ×2 (regional and national period).
 */
export interface PrecipMeasurement {
  /** 0-13-11: kg/m², tenths. 0.0 if none; -0.1 for trace. */
  amountKgM2: Maybe<number>;
  /** 0-4-24: negative hours (e.g. -6, -12, -24 regional; -1, -3 national). */
  periodHours: number;
}

/**
 * One wind gust entry from the 2-replicated block inside 3-02-042.
 */
export interface WindGust {
  /** 0-11-43: maximum gust direction, degrees true. */
  directionDegTrue: Maybe<number>;
  /** 0-4-25: period in minutes (negative). Regional/national decision. */
  periodMinutes: number;
  /** 0-11-41: maximum gust speed, m/s (tenths). */
  speedMps: Maybe<number>;
}

/**
 * One entry from 3-02-045, replicated ×2 (1h and 24h radiation).
 */
export interface RadiationPeriod {
  /** 0-14-29: diffuse solar radiation J/m². */
  diffuseSolarJM2: Maybe<number>;
  /** 0-14-30: direct solar radiation J/m². */
  directSolarJM2: Maybe<number>;
  /** 0-14-28: global solar radiation J/m². */
  globalSolarJM2: Maybe<number>;
  /** 0-14-2: long-wave radiation J/m². Positive=downward; negative=upward. */
  lwRadiationJM2: Maybe<number>;
  /** 0-14-16: net radiation J/m². */
  netRadiationJM2: Maybe<number>;
  /** 0-4-24: -1 (1-hour) or -24 (24-hour). */
  periodHours: -1 | -24;
  /** 0-14-4: short-wave radiation J/m². */
  swRadiationJM2: Maybe<number>;
}

/* ---------------------------------- */
/*        Template: TM 307080         */
/* ---------------------------------- */

export interface BufrTemplateDef {
  description: string;
  expectedGroups: Array<{
    name: string;
    minKeys: DescriptorKey[];
    notes?: string;
  }>;
  templateId: "TM_307080";
}

export const TM_307080: BufrTemplateDef = {
  templateId: "TM_307080",
  description:
    "BUFR template for synoptic reports from fixed land stations suitable for SYNOP data (3-07-080, B/C1).",
  expectedGroups: [
    {
      name: "Surface station identification; time; horizontal/vertical coordinates (3-01-090)",
      minKeys: [
        "WMO_BLOCK_NUMBER",
        "WMO_STATION_NUMBER",
        "STATION_NAME",
        "STATION_TYPE",
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
        "Block+station number must be non-missing; actual time of observation shall be reported (B/C1.2).",
    },
    {
      name: "Pressure information (3-02-031)",
      minKeys: [
        "STATION_PRESSURE",
        "MSLP",
        "PRESSURE_CHANGE_3H",
        "PRESSURE_TENDENCY_CHAR",
        "PRESSURE_CHANGE_24H",
        "STANDARD_LEVEL_PRESSURE",
        "GEOPOTENTIAL_HEIGHT",
      ],
      notes:
        "Station pressure + MSLP in Pa, tens of Pa. 24h change by regional decision. Standard level for high-level stations (B/C1.3).",
    },
    {
      name: "Basic synoptic instantaneous – temperature and humidity (3-02-032 inside 3-02-035)",
      minKeys: [
        "SENSOR_HEIGHT_T",
        "AIR_TEMPERATURE",
        "DEWPOINT_TEMPERATURE",
        "RELATIVE_HUMIDITY",
      ],
      notes:
        "Report both dewpoint and RH when available. Temperatures in K, hundredths (B/C1.4.1).",
    },
    {
      name: "Basic synoptic instantaneous – visibility (3-02-033 inside 3-02-035)",
      minKeys: ["SENSOR_HEIGHT_VIS", "HORIZONTAL_VIS"],
      notes: "Shortest direction if non-uniform; cap at 81900 m (B/C1.4.2).",
    },
    {
      name: "Basic synoptic instantaneous – precipitation past 24h (3-02-034 inside 3-02-035)",
      minKeys: ["SENSOR_HEIGHT_PRECIP_24H", "PRECIP_24H"],
      notes: "Include at least once/day at a main synoptic time (B/C1.4.3).",
    },
    {
      name: "Basic synoptic instantaneous – general cloud information (3-02-004 inside 3-02-035)",
      minKeys: [
        "CLOUD_COVER_TOTAL",
        "VERTICAL_SIGNIFICANCE",
        "CLOUD_AMOUNT_LOW_MID",
        "CLOUD_BASE_HEIGHT",
        "CLOUD_TYPE_LOW",
        "CLOUD_TYPE_MID",
        "CLOUD_TYPE_HIGH",
      ],
      notes:
        "Individual cloud layers from replicated 3-02-005; pass via SynopReplicationInputs (B/C1.4.4–B/C1.4.5).",
    },
    {
      name: "Clouds with bases below station level (3-02-036)",
      minKeys: ["CLOUD_TOP_HEIGHT", "CLOUD_TOP_DESC"],
      notes:
        "Replicated; pass via SynopReplicationInputs. 0=no layers. VS=10 for base-below-tops-above (B/C1.5).",
    },
    {
      name: "Direction of cloud drift (3-02-047) – 3 replications",
      minKeys: ["VERTICAL_SIGNIFICANCE", "CLOUD_DRIFT_DIR"],
      notes:
        "Replicated 3×: low(7)/mid(8)/high(9) clouds. Pass via SynopReplicationInputs (B/C1.6).",
    },
    {
      name: "Direction and elevation of cloud (3-02-048)",
      minKeys: ["BEARING_AZIMUTH", "ELEVATION_ANGLE", "CLOUD_TYPE"],
      notes:
        "Required mainly for tropical land stations. Pass via SynopReplicationInputs (B/C1.7).",
    },
    {
      name: "State of ground, snow depth, ground minimum temperature (3-02-037)",
      minKeys: ["STATE_OF_GROUND", "SNOW_DEPTH", "GROUND_MIN_TEMP_12H"],
      notes: "Synoptic hour by regional decision; at minimum 4×/day (B/C1.8).",
    },
    {
      name: "Basic synoptic period – present and past weather (3-02-038 inside 3-02-043)",
      minKeys: [
        "PRESENT_WEATHER",
        "TIME_PERIOD_HOURS",
        "PAST_WEATHER_1",
        "PAST_WEATHER_2",
      ],
      notes:
        "Report if observation was made regardless of significance (B/C1.10.1).",
    },
    {
      name: "Basic synoptic period – sunshine (3-02-039, replicated ×2)",
      minKeys: ["TIME_PERIOD_HOURS", "TOTAL_SUNSHINE"],
      notes:
        "1h (national) and 24h (regional) replications. Pass via SynopReplicationInputs (B/C1.10.2).",
    },
    {
      name: "Basic synoptic period – precipitation measurement (3-02-040, replicated ×2)",
      minKeys: [
        "SENSOR_HEIGHT_PRECIP_PERIOD",
        "TIME_PERIOD_HOURS",
        "TOTAL_PRECIP",
      ],
      notes:
        "Regional (e.g. −6h, −12h, −24h) and national periods. Pass via SynopReplicationInputs (B/C1.10.3).",
    },
    {
      name: "Basic synoptic period – extreme temperatures (3-02-041)",
      minKeys: [
        "SENSOR_HEIGHT_EXTREME_T",
        "TIME_PERIOD_HOURS",
        "MAX_TEMPERATURE",
        "MIN_TEMPERATURE",
      ],
      notes:
        "Period by regional decision; two 0-4-24 values construct the time range (B/C1.10.4).",
    },
    {
      name: "Basic synoptic period – wind data (3-02-042)",
      minKeys: [
        "SENSOR_HEIGHT_WIND",
        "WIND_INSTRUMENT_TYPE",
        "TIME_SIGNIFICANCE",
        "TIME_PERIOD_MINUTES",
        "WIND_DIR",
        "WIND_SPEED",
        "MAX_GUST_DIR",
        "MAX_GUST_SPEED",
      ],
      notes:
        "10-min mean wind (−10 min, time-averaged). Gusts replicated ×2 via SynopReplicationInputs (B/C1.10.5).",
    },
    {
      name: "Evaporation data (3-02-044)",
      minKeys: ["TIME_PERIOD_HOURS", "EVAP_INSTRUMENT_TYPE", "EVAPORATION"],
      notes:
        "Previous 24h (period=−24). Report at 0000/0600/1200 UTC (B/C1.11).",
    },
    {
      name: "Radiation data (3-02-045, replicated ×2 for 1h and 24h)",
      minKeys: [
        "TIME_PERIOD_HOURS",
        "LW_RADIATION",
        "SW_RADIATION",
        "NET_RADIATION",
        "GLOBAL_SOLAR_RADIATION",
        "DIFFUSE_SOLAR_RADIATION",
        "DIRECT_SOLAR_RADIATION",
      ],
      notes: "Pass via SynopReplicationInputs. J/m² (B/C1.12).",
    },
    {
      name: "Temperature change (3-02-046)",
      minKeys: ["TIME_PERIOD_HOURS", "TEMPERATURE_CHANGE"],
      notes:
        "Report only if ≥5°C change in <30 min. Period from two 0-4-24 values (B/C1.13).",
    },
  ],
};

/* ---------------------------------- */
/*    Canonical observation model     */
/* ---------------------------------- */

/** Raw decoded BUFR values keyed by F-X-Y. A flat map — one value per FXY.
 *  Replicated sequences must be decoded externally and passed as SynopReplicationInputs. */
export type DecodedBufrMap = Partial<Record<BufrFxy, Maybe<number | string>>>;

/** Canonical station identity (DB-friendly). */
export interface StationIdentity {
  stationName?: Maybe<string>;
  stationType?: Maybe<number>; // code table value: 0=auto, 1=manned, 2=hybrid
  wmoBlock: number;
  wmoStation: number;
}

/**
 * Full canonical observation for TM 307080 SYNOP.
 * Non-replicated fields come from DecodedBufrMap.
 * Replicated group arrays come from SynopReplicationInputs.
 */
export interface SynopObservation {
  // ── Temperature & humidity (3-02-032) ─────────────────────────────────────
  airTemperatureK?: Maybe<number>;
  // ── Coordinates ───────────────────────────────────────────────────────────
  barometerMslM?: Maybe<number>;
  // ── General cloud information (3-02-004) ──────────────────────────────────
  /** Nh — amount of low or middle clouds (oktas, code table). */
  cloudAmountLowMid?: Maybe<number>;
  /** h — height of base of lowest cloud, metres. */
  cloudBaseHeightM?: Maybe<number>;
  cloudCoverTotalPct?: Maybe<number>;
  // ── Direction of cloud drift (3-02-047, 3 replications) ───────────────────
  cloudDrift?: CloudDriftEntry[];
  // ── Direction and elevation of cloud (3-02-048) ───────────────────────────
  cloudElevations?: CloudElevationEntry[];
  // ── Individual cloud layers (3-02-005, replicated ≤4) ────────────────────
  cloudLayers?: IndividualCloudLayer[];
  // ── Clouds with bases below station level (3-02-036, replicated) ──────────
  cloudsBelowStation?: CloudBelowStation[];
  /** CH — high cloud type code. */
  cloudTypeHigh?: Maybe<number>;
  /** CL — low cloud type code. */
  cloudTypeLow?: Maybe<number>;
  /** CM — middle cloud type code. */
  cloudTypeMid?: Maybe<number>;
  /** Code table 0-8-2 value for the general cloud group (7=low, 8=mid, 9=high, 5=ceiling, 62=N/A, 63=missing). */
  cloudVerticalSignificance?: Maybe<number>;
  dewpointTemperatureK?: Maybe<number>;
  // ── Evaporation data (3-02-044) ────────────────────────────────────────────
  evapInstrumentType?: Maybe<number>;
  evaporationKgM2?: Maybe<number>;
  evapPeriodHours?: Maybe<number>; // −24
  // ── Pressure information (3-02-031) ────────────────────────────────────────
  geopotentialHeightGpm?: Maybe<number>;
  // ── State of ground / snow / ground minimum temperature (3-02-037) ────────
  groundMinTemp12hK?: Maybe<number>;
  // ── Visibility (3-02-033) ─────────────────────────────────────────────────
  horizontalVisibilityM?: Maybe<number>;
  latitudeDeg?: Maybe<number>;
  longitudeDeg?: Maybe<number>;
  maxTemperatureK?: Maybe<number>;
  // ── Extreme temperature data (3-02-041) ───────────────────────────────────
  /** First 0-4-24 for max temp period start (hours, negative). */
  maxTempPeriodHours1?: Maybe<number>;
  /** Second 0-4-24 for max temp period end (0 if ends at obs time). */
  maxTempPeriodHours2?: Maybe<number>;
  minTemperatureK?: Maybe<number>;
  /** First 0-4-24 for min temp period start (hours, negative). */
  minTempPeriodHours1?: Maybe<number>;
  /** Second 0-4-24 for min temp period end. */
  minTempPeriodHours2?: Maybe<number>;
  mslPressurePa?: Maybe<number>;
  // ── Observation timestamp ──────────────────────────────────────────────────
  observedAtUtc: ISO8601;
  // ── Present and past weather (3-02-038) ───────────────────────────────────
  pastWeather1?: Maybe<number>;
  pastWeather2?: Maybe<number>;
  /** Period in hours (negative) for past weather 1 & 2 (B/C1.10.1.7.1). */
  pastWeatherPeriodHours?: Maybe<number>;
  // ── Precipitation past 24h (3-02-034) ────────────────────────────────────
  precip24hKgM2?: Maybe<number>;
  // ── Precipitation measurement (3-02-040, replicated ×2) ───────────────────
  precipMeasurements?: PrecipMeasurement[];
  presentWeather?: Maybe<number>;
  pressureChange3hPa?: Maybe<number>;
  pressureChange24hPa?: Maybe<number>;
  pressureTendencyChar?: Maybe<number>;
  // ── Radiation data (3-02-045, replicated ×2) ──────────────────────────────
  radiation?: RadiationPeriod[];
  relativeHumidityPct?: Maybe<number>;
  sensorHeightExtremeM?: Maybe<number>;
  sensorHeightTM?: Maybe<number>;
  // ── Wind data (3-02-042) ──────────────────────────────────────────────────
  sensorHeightWindM?: Maybe<number>;
  snowDepthM?: Maybe<number>;
  /** Standard isobaric level for geopotential height reporting (high-level stations). */
  standardLevelPressurePa?: Maybe<number>;
  stateOfGround?: Maybe<number>;
  // ── Identifiers ────────────────────────────────────────────────────────────
  station: StationIdentity;
  stationGroundMslM?: Maybe<number>;
  stationPressurePa?: Maybe<number>;
  // ── Sunshine data (3-02-039, replicated ×2) ───────────────────────────────
  sunshine?: SunshinePeriod[];
  // ── Temperature change (3-02-046) ─────────────────────────────────────────
  tempChangeK?: Maybe<number>;
  /** First 0-4-24 for temperature change period (hours, negative). */
  tempChangePeriodHours1?: Maybe<number>;
  /** Second 0-4-24 for temperature change period end. */
  tempChangePeriodHours2?: Maybe<number>;
  windDirDegTrue?: Maybe<number>;
  /** Replicated gust periods (usually ×2, by regional/national decision). */
  windGusts?: WindGust[];
  windInstrumentType?: Maybe<number>;
  windSpeedMps?: Maybe<number>;
}

/* ---------------------------------- */
/*   Replicated group inputs          */
/* ---------------------------------- */

/**
 * Pre-decoded replicated groups from a BUFR SYNOP message.
 * The caller's decoder is responsible for parsing replication operators
 * (1-01-000, 1-05-000, 1-02-003, 1-01-002 etc.) and populating these arrays.
 */
export interface SynopReplicationInputs {
  /** 3-02-047 replicated cloud drift directions (3 entries: VS 7, 8, 9). */
  cloudDrift?: CloudDriftEntry[];
  /** 3-02-048 cloud direction/elevation entries. */
  cloudElevations?: CloudElevationEntry[];
  /** 3-02-005 replicated individual cloud layers (≤4). In order lower→higher (B/C1.4.5.1.3). */
  cloudLayers?: IndividualCloudLayer[];
  /** 3-02-036 replicated clouds with bases below station (0=none). */
  cloudsBelowStation?: CloudBelowStation[];
  /** 3-02-040 replicated precipitation (up to 2: regional + national period). */
  precipMeasurements?: PrecipMeasurement[];
  /** 3-02-045 replicated radiation (up to 2: −1h, −24h). */
  radiation?: RadiationPeriod[];
  /** 3-02-043 replicated sunshine duration (up to 2: −1h, −24h). */
  sunshine?: SunshinePeriod[];
  /** 3-02-041 replicated wind gusts (up to 2 periods). */
  windGusts?: WindGust[];
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
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return d.toISOString();
}

/** Convenience unit conversions. Decoders may deliver non-SI values; use these to normalise. */
export const Units = {
  cToK: (c: number): number => c + 273.15,
  kToC: (k: number): number => k - 273.15,
  hPaToPa: (hpa: number): number => hpa * 100,
  paToHpa: (pa: number): number => pa / 100,
};

/* ---------------------------------- */
/*     Normalization (decoded → model) */
/* ---------------------------------- */

export interface NormalizeOptions {
  /**
   * Set true if your BUFR decoder returns pressure in hPa instead of Pa.
   * WMO BUFR encodes pressure in Pa; normalisation converts to Pa.
   */
  decoderPressureIsHpa?: boolean;
  /**
   * Set true if your decoder returns temperatures in °C instead of K.
   * WMO BUFR encodes temps in K.
   */
  decoderTempsAreCelsius?: boolean;
}

/**
 * Map decoded BUFR descriptor values into a canonical SynopObservation.
 * Handles all non-replicated fields from TM 307080.
 * Pass pre-decoded replicated groups via the optional `replication` parameter.
 */
export function normalizeSynopTM307080(
  decoded: DecodedBufrMap,
  opts: NormalizeOptions = {},
  replication: SynopReplicationInputs = {}
): SynopObservation {
  // ── Required station identification ──────────────────────────────────────
  const wmoBlock = mustInt(
    asNumber(decoded[D.WMO_BLOCK_NUMBER.fxy]),
    "wmoBlock"
  );
  const wmoStation = mustInt(
    asNumber(decoded[D.WMO_STATION_NUMBER.fxy]),
    "wmoStation"
  );

  // ── Required observation time ─────────────────────────────────────────────
  const year = mustInt(asNumber(decoded[D.YEAR.fxy]), "year");
  const month = mustInt(asNumber(decoded[D.MONTH.fxy]), "month");
  const day = mustInt(asNumber(decoded[D.DAY.fxy]), "day");
  const hour = mustInt(asNumber(decoded[D.HOUR.fxy]), "hour");
  const minute = mustInt(asNumber(decoded[D.MINUTE.fxy]), "minute");
  const observedAtUtc = toIsoUtc(year, month, day, hour, minute);

  // ── Coordinates ───────────────────────────────────────────────────────────
  const latitudeDeg = asNumber(decoded[D.LATITUDE_HA.fxy]);
  const longitudeDeg = asNumber(decoded[D.LONGITUDE_HA.fxy]);
  const stationGroundMslM = asNumber(decoded[D.STATION_GROUND_MSL.fxy]);
  const barometerMslM = asNumber(decoded[D.BAROMETER_MSL.fxy]);

  // ── Pressure ──────────────────────────────────────────────────────────────
  function normPa(raw: Maybe<number>): Maybe<number> {
    if (raw === null) return null;
    return opts.decoderPressureIsHpa ? Units.hPaToPa(raw) : raw;
  }

  const stationPressurePa = normPa(asNumber(decoded[D.STATION_PRESSURE.fxy]));
  const mslPressurePa = normPa(asNumber(decoded[D.MSLP.fxy]));
  const pressureChange3hPa = normPa(
    asNumber(decoded[D.PRESSURE_CHANGE_3H.fxy])
  );
  const pressureTendencyChar = asNumber(decoded[D.PRESSURE_TENDENCY_CHAR.fxy]);
  const pressureChange24hPa = normPa(
    asNumber(decoded[D.PRESSURE_CHANGE_24H.fxy])
  );
  const standardLevelPressurePa = normPa(
    asNumber(decoded[D.STANDARD_LEVEL_PRESSURE.fxy])
  );
  const geopotentialHeightGpm = asNumber(decoded[D.GEOPOTENTIAL_HEIGHT.fxy]);

  // ── Temperature & humidity ────────────────────────────────────────────────
  function normK(raw: Maybe<number>): Maybe<number> {
    if (raw === null) return null;
    return opts.decoderTempsAreCelsius ? Units.cToK(raw) : raw;
  }

  const sensorHeightTM = asNumber(decoded[D.SENSOR_HEIGHT_T.fxy]);
  const airTemperatureK = normK(asNumber(decoded[D.AIR_TEMPERATURE.fxy]));
  const dewpointTemperatureK = normK(
    asNumber(decoded[D.DEWPOINT_TEMPERATURE.fxy])
  );
  const relativeHumidityPct = asNumber(decoded[D.RELATIVE_HUMIDITY.fxy]);

  // ── Visibility ────────────────────────────────────────────────────────────
  const horizontalVisibilityM = asNumber(decoded[D.HORIZONTAL_VIS.fxy]);

  // ── Precipitation past 24h ────────────────────────────────────────────────
  const precip24hKgM2 = asNumber(decoded[D.PRECIP_24H.fxy]);

  // ── General cloud information ─────────────────────────────────────────────
  // Note: 0-20-12 appears 3× in the sequence; the flat decoded map can only
  // hold one value per FXY. Supply cloudTypeLow/Mid/High via the decoded map
  // with aliased keys if your decoder supports it, or handle via the cloud
  // layer replication mechanism.
  const cloudCoverTotalPct = asNumber(decoded[D.CLOUD_COVER_TOTAL.fxy]);
  const cloudVerticalSignificance = asNumber(
    decoded[D.VERTICAL_SIGNIFICANCE.fxy]
  );
  const cloudAmountLowMid = asNumber(decoded[D.CLOUD_AMOUNT_LOW_MID.fxy]);
  const cloudBaseHeightM = asNumber(decoded[D.CLOUD_BASE_HEIGHT.fxy]);
  // Cloud types: these share FXY 0-20-12. If your decoder can distinguish
  // them (e.g. by sequence position), inject them via decoded with separate
  // lookup keys; otherwise they will all resolve to the same flat-map entry.
  const cloudTypeLow = asNumber(decoded[D.CLOUD_TYPE_LOW.fxy]);
  const cloudTypeMid = asNumber(decoded[D.CLOUD_TYPE_MID.fxy]);
  const cloudTypeHigh = asNumber(decoded[D.CLOUD_TYPE_HIGH.fxy]);

  // ── State of ground / snow / ground minimum temperature ───────────────────
  const stateOfGround = asNumber(decoded[D.STATE_OF_GROUND.fxy]);
  const snowDepthM = asNumber(decoded[D.SNOW_DEPTH.fxy]);
  const groundMinTemp12hK = normK(asNumber(decoded[D.GROUND_MIN_TEMP_12H.fxy]));

  // ── Present and past weather ──────────────────────────────────────────────
  const presentWeather = asNumber(decoded[D.PRESENT_WEATHER.fxy]);
  const pastWeatherPeriodHours = asNumber(decoded[D.TIME_PERIOD_HOURS.fxy]);
  const pastWeather1 = asNumber(decoded[D.PAST_WEATHER_1.fxy]);
  const pastWeather2 = asNumber(decoded[D.PAST_WEATHER_2.fxy]);

  // ── Extreme temperature ───────────────────────────────────────────────────
  const sensorHeightExtremeM = asNumber(decoded[D.SENSOR_HEIGHT_EXTREME_T.fxy]);
  // Two 0-4-24 for max, two for min — the flat map resolves to the last value.
  // Callers that need both must pass them via a custom extension or separate keys.
  const maxTemperatureK = normK(asNumber(decoded[D.MAX_TEMPERATURE.fxy]));
  const minTemperatureK = normK(asNumber(decoded[D.MIN_TEMPERATURE.fxy]));

  // ── Wind ──────────────────────────────────────────────────────────────────
  const sensorHeightWindM = asNumber(decoded[D.SENSOR_HEIGHT_WIND.fxy]);
  const windInstrumentType = asNumber(decoded[D.WIND_INSTRUMENT_TYPE.fxy]);
  const windDirDegTrue = asNumber(decoded[D.WIND_DIR.fxy]);
  const windSpeedMps = asNumber(decoded[D.WIND_SPEED.fxy]);

  // ── Evaporation ───────────────────────────────────────────────────────────
  const evapInstrumentType = asNumber(decoded[D.EVAP_INSTRUMENT_TYPE.fxy]);
  const evaporationKgM2 = asNumber(decoded[D.EVAPORATION.fxy]);

  // ── Temperature change ────────────────────────────────────────────────────
  const tempChangeK = asNumber(decoded[D.TEMPERATURE_CHANGE.fxy]);

  // ── Station metadata ──────────────────────────────────────────────────────
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
    pressureChange24hPa,
    standardLevelPressurePa,
    geopotentialHeightGpm,

    sensorHeightTM,
    airTemperatureK,
    dewpointTemperatureK,
    relativeHumidityPct,

    horizontalVisibilityM,
    precip24hKgM2,

    cloudCoverTotalPct,
    cloudVerticalSignificance,
    cloudAmountLowMid,
    cloudBaseHeightM,
    cloudTypeLow,
    cloudTypeMid,
    cloudTypeHigh,

    cloudLayers: replication.cloudLayers,
    cloudsBelowStation: replication.cloudsBelowStation,
    cloudDrift: replication.cloudDrift,
    cloudElevations: replication.cloudElevations,

    stateOfGround,
    snowDepthM,
    groundMinTemp12hK,

    presentWeather,
    pastWeatherPeriodHours,
    pastWeather1,
    pastWeather2,

    sunshine: replication.sunshine,
    precipMeasurements: replication.precipMeasurements,

    sensorHeightExtremeM,
    maxTemperatureK,
    minTemperatureK,

    sensorHeightWindM,
    windInstrumentType,
    windDirDegTrue,
    windSpeedMps,
    windGusts: replication.windGusts,

    evapInstrumentType,
    evaporationKgM2,

    radiation: replication.radiation,

    tempChangeK,
  };
}

/* ---------------------------------- */
/*         DB row flattening          */
/* ---------------------------------- */

export interface DbStationRow {
  barometer_msl_m: Maybe<number>;
  latitude_deg: Maybe<number>;
  longitude_deg: Maybe<number>;
  name: Maybe<string>;
  station_ground_msl_m: Maybe<number>;
  /** e.g. "WMO:BLOCK-STATION" */
  station_id: string;
  type_code: Maybe<number>;
  wmo_block: number;
  wmo_station: number;
}

export interface DbObservationRow {
  obs_id: string;
  observed_at_utc: ISO8601;
  station_id: string;
  template: "TM_307080";
}

export interface DbElementRow {
  element: string;
  obs_id: string;
  unit: Unit;
  value_num: Maybe<number>;
  value_text: Maybe<string>;
}

export interface DbCloudLayerRow {
  base_height_m: Maybe<number>;
  cloud_amount: Maybe<number>;
  cloud_type: Maybe<number>;
  layer_index: number;
  obs_id: string;
  vertical_significance: Maybe<number>;
}

export interface DbCloudBelowStationRow {
  cloud_amount: Maybe<number>;
  cloud_type: Maybe<number>;
  layer_index: number;
  obs_id: string;
  top_description: Maybe<number>;
  top_height_msl_m: Maybe<number>;
  vertical_significance: Maybe<number>;
}

export interface DbPrecipMeasurementRow {
  amount_kg_m2: Maybe<number>;
  obs_id: string;
  period_hours: number;
}

export interface DbRadiationRow {
  diffuse_solar_j_m2: Maybe<number>;
  direct_solar_j_m2: Maybe<number>;
  global_solar_j_m2: Maybe<number>;
  lw_radiation_j_m2: Maybe<number>;
  net_radiation_j_m2: Maybe<number>;
  obs_id: string;
  period_hours: number;
  sw_radiation_j_m2: Maybe<number>;
}

export interface DbWindGustRow {
  direction_deg_true: Maybe<number>;
  obs_id: string;
  period_minutes: number;
  speed_mps: Maybe<number>;
}

export interface FlattenedSynopRows {
  cloudLayers: DbCloudLayerRow[];
  cloudsBelowStation: DbCloudBelowStationRow[];
  elements: DbElementRow[];
  observation: DbObservationRow;
  precipMeasurements: DbPrecipMeasurementRow[];
  radiation: DbRadiationRow[];
  station: DbStationRow;
  windGusts: DbWindGustRow[];
}

export function makeStationId(station: StationIdentity): string {
  return `WMO:${station.wmoBlock}-${String(station.wmoStation).padStart(5, "0")}`;
}

export function makeObsId(stationId: string, observedAtUtc: ISO8601): string {
  return `OBS:${stationId}:${observedAtUtc}`;
}

function el(
  obsId: string,
  element: string,
  value: Maybe<number>,
  unit: Unit
): DbElementRow {
  return {
    obs_id: obsId,
    element,
    value_num: value ?? null,
    value_text: null,
    unit,
  };
}

function buildPressureElements(
  obsId: string,
  obs: SynopObservation
): DbElementRow[] {
  return [
    el(obsId, "station_pressure_pa", obs.stationPressurePa ?? null, "Pa"),
    el(obsId, "mslp_pa", obs.mslPressurePa ?? null, "Pa"),
    el(obsId, "pressure_change_3h_pa", obs.pressureChange3hPa ?? null, "Pa"),
    el(
      obsId,
      "pressure_tendency_char",
      obs.pressureTendencyChar ?? null,
      "code_table"
    ),
    el(obsId, "pressure_change_24h_pa", obs.pressureChange24hPa ?? null, "Pa"),
    el(
      obsId,
      "standard_level_pressure_pa",
      obs.standardLevelPressurePa ?? null,
      "Pa"
    ),
    el(
      obsId,
      "geopotential_height_gpm",
      obs.geopotentialHeightGpm ?? null,
      "gpm"
    ),
  ];
}

function buildThermoElements(
  obsId: string,
  obs: SynopObservation
): DbElementRow[] {
  return [
    el(obsId, "sensor_height_t_m", obs.sensorHeightTM ?? null, "m"),
    el(obsId, "air_temperature_k", obs.airTemperatureK ?? null, "K"),
    el(obsId, "dewpoint_temperature_k", obs.dewpointTemperatureK ?? null, "K"),
    el(
      obsId,
      "relative_humidity_pct",
      obs.relativeHumidityPct ?? null,
      "percent"
    ),
    el(
      obsId,
      "sensor_height_extreme_t_m",
      obs.sensorHeightExtremeM ?? null,
      "m"
    ),
    el(obsId, "max_temperature_k", obs.maxTemperatureK ?? null, "K"),
    el(obsId, "min_temperature_k", obs.minTemperatureK ?? null, "K"),
    el(obsId, "temp_change_k", obs.tempChangeK ?? null, "K"),
  ];
}

function buildCloudElements(
  obsId: string,
  obs: SynopObservation
): DbElementRow[] {
  const scalars: DbElementRow[] = [
    el(
      obsId,
      "cloud_cover_total_pct",
      obs.cloudCoverTotalPct ?? null,
      "percent"
    ),
    el(
      obsId,
      "cloud_vertical_significance",
      obs.cloudVerticalSignificance ?? null,
      "code_table"
    ),
    el(
      obsId,
      "cloud_amount_low_mid",
      obs.cloudAmountLowMid ?? null,
      "code_table"
    ),
    el(obsId, "cloud_base_height_m", obs.cloudBaseHeightM ?? null, "m"),
    el(obsId, "cloud_type_low", obs.cloudTypeLow ?? null, "code_table"),
    el(obsId, "cloud_type_mid", obs.cloudTypeMid ?? null, "code_table"),
    el(obsId, "cloud_type_high", obs.cloudTypeHigh ?? null, "code_table"),
  ];
  const drift = (obs.cloudDrift ?? []).map((cd) =>
    el(
      obsId,
      `cloud_drift_dir_deg_vs${cd.verticalSignificance}`,
      cd.directionDegTrue,
      "degree_true"
    )
  );
  const elevations = (obs.cloudElevations ?? []).flatMap((ce, i) => [
    el(obsId, `cloud_elev_bearing_deg_${i}`, ce.bearingDegTrue, "degree_true"),
    el(obsId, `cloud_elev_angle_deg_${i}`, ce.elevationDeg, "degree"),
    el(obsId, `cloud_elev_type_${i}`, ce.cloudType, "code_table"),
  ]);
  return [...scalars, ...drift, ...elevations];
}

function buildSurfaceElements(
  obsId: string,
  obs: SynopObservation
): DbElementRow[] {
  return [
    el(
      obsId,
      "horizontal_visibility_m",
      obs.horizontalVisibilityM ?? null,
      "m"
    ),
    el(obsId, "state_of_ground", obs.stateOfGround ?? null, "code_table"),
    el(obsId, "snow_depth_m", obs.snowDepthM ?? null, "m"),
    el(obsId, "ground_min_temp_12h_k", obs.groundMinTemp12hK ?? null, "K"),
    el(obsId, "present_weather", obs.presentWeather ?? null, "code_table"),
    el(
      obsId,
      "past_weather_period_hours",
      obs.pastWeatherPeriodHours ?? null,
      "hour"
    ),
    el(obsId, "past_weather_1", obs.pastWeather1 ?? null, "code_table"),
    el(obsId, "past_weather_2", obs.pastWeather2 ?? null, "code_table"),
  ];
}

function buildWindPrecipElements(
  obsId: string,
  obs: SynopObservation
): DbElementRow[] {
  const wind: DbElementRow[] = [
    el(obsId, "sensor_height_wind_m", obs.sensorHeightWindM ?? null, "m"),
    el(
      obsId,
      "wind_instrument_type",
      obs.windInstrumentType ?? null,
      "flag_table"
    ),
    el(obsId, "wind_dir_deg_true", obs.windDirDegTrue ?? null, "degree_true"),
    el(obsId, "wind_speed_mps", obs.windSpeedMps ?? null, "mps"),
  ];
  const precip: DbElementRow[] = [
    el(obsId, "precip_24h_kg_m2", obs.precip24hKgM2 ?? null, "kg_m2"),
    el(
      obsId,
      "evap_instrument_type",
      obs.evapInstrumentType ?? null,
      "code_table"
    ),
    el(obsId, "evaporation_kg_m2", obs.evaporationKgM2 ?? null, "kg_m2"),
  ];
  const sunshine = (obs.sunshine ?? []).map((s) =>
    el(
      obsId,
      `sunshine_min_${Math.abs(s.periodHours)}h`,
      s.durationMinutes,
      "minute"
    )
  );
  return [...wind, ...precip, ...sunshine];
}

/**
 * Flatten canonical SynopObservation to DB rows.
 *
 * Recommended DB schema:
 *   - `stations`               — station dimension (upsert on station_id)
 *   - `observations`           — observation fact (upsert on obs_id)
 *   - `observation_elements`   — tall/narrow scalar elements
 *   - `cloud_layers`           — individual cloud layer rows
 *   - `clouds_below_station`   — cloud-below-station rows
 *   - `precip_measurements`    — precipitation period rows
 *   - `radiation`              — radiation period rows
 *   - `wind_gusts`             — wind gust period rows
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
    ...buildPressureElements(obsId, obs),
    ...buildThermoElements(obsId, obs),
    ...buildCloudElements(obsId, obs),
    ...buildSurfaceElements(obsId, obs),
    ...buildWindPrecipElements(obsId, obs),
  ];

  // ── Cloud layers (individual, replicated) ─────────────────────────────────
  const cloudLayers: DbCloudLayerRow[] = (obs.cloudLayers ?? []).map(
    (layer, i) => ({
      obs_id: obsId,
      layer_index: i,
      vertical_significance: layer.verticalSignificance,
      cloud_amount: layer.cloudAmount,
      cloud_type: layer.cloudType,
      base_height_m: layer.baseHeightM,
    })
  );

  // ── Clouds below station (replicated) ─────────────────────────────────────
  const cloudsBelowStation: DbCloudBelowStationRow[] = (
    obs.cloudsBelowStation ?? []
  ).map((c, i) => ({
    obs_id: obsId,
    layer_index: i,
    vertical_significance: c.verticalSignificance,
    cloud_amount: c.cloudAmount,
    cloud_type: c.cloudType,
    top_height_msl_m: c.topHeightMslM,
    top_description: c.topDescription,
  }));

  // ── Precipitation measurements (replicated) ────────────────────────────────
  const precipMeasurements: DbPrecipMeasurementRow[] = (
    obs.precipMeasurements ?? []
  ).map((p) => ({
    obs_id: obsId,
    period_hours: p.periodHours,
    amount_kg_m2: p.amountKgM2,
  }));

  // ── Radiation (replicated) ────────────────────────────────────────────────
  const radiation: DbRadiationRow[] = (obs.radiation ?? []).map((r) => ({
    obs_id: obsId,
    period_hours: r.periodHours,
    lw_radiation_j_m2: r.lwRadiationJM2,
    sw_radiation_j_m2: r.swRadiationJM2,
    net_radiation_j_m2: r.netRadiationJM2,
    global_solar_j_m2: r.globalSolarJM2,
    diffuse_solar_j_m2: r.diffuseSolarJM2,
    direct_solar_j_m2: r.directSolarJM2,
  }));

  // ── Wind gusts (replicated) ───────────────────────────────────────────────
  const windGusts: DbWindGustRow[] = (obs.windGusts ?? []).map((g) => ({
    obs_id: obsId,
    period_minutes: g.periodMinutes,
    direction_deg_true: g.directionDegTrue,
    speed_mps: g.speedMps,
  }));

  return {
    station,
    observation,
    elements,
    cloudLayers,
    cloudsBelowStation,
    precipMeasurements,
    radiation,
    windGusts,
  };
}

/* ---------------------------------- */
/*      Section 1 / header logic      */
/* ---------------------------------- */

/**
 * SYNOP international data sub-category (WMO B/C1.1.1 Note 1):
 *   00/06/12/18 UTC → 002 (main synoptic times)
 *   03/09/15/21 UTC → 001 (intermediate)
 *   all others      → 000
 */
export function synopInternationalSubCategory(hourUtc: number): 0 | 1 | 2 {
  if (new Set([0, 6, 12, 18]).has(hourUtc)) return 2;
  if (new Set([3, 9, 15, 21]).has(hourUtc)) return 1;
  return 0;
}

/* ---------------------------------- */
/*      Extensibility / plug-ins      */
/* ---------------------------------- */

/**
 * Extension point for regional sequences (3-07-081 to 3-07-086) or national additions.
 * WMO regs allow supplementing 3-07-080 with additional element descriptors (B/C1.9, B/C1.14).
 */
export interface DescriptorExtension {
  defs: BufrDescriptorDef[];
  toElements?: (obsId: string, decoded: DecodedBufrMap) => DbElementRow[];
}

export function buildDescriptorIndex(extra: DescriptorExtension[] = []) {
  const base = Object.values(D).map((d) => [d.fxy, d] as const);
  const added = extra.flatMap((e) => e.defs.map((d) => [d.fxy, d] as const));
  return new Map<BufrFxy, BufrDescriptorDef>([...base, ...added]);
}
