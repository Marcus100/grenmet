// Plain readings (no units, as on the paper register) shown above the coded entry in the register, like the
// two-layer cells on the paper register ("18" over VV "68", "1015.3" over
// "0153"). Display only: the API validates and decodes authoritatively.
// A reading is "" while the cell is empty and null when the code is not valid.

import {
  type Computed,
  humidityFromValues,
  hundredsOfFeet,
  layerHeightMetres,
  qfe,
  qnh,
  type StationSettings,
  saturationVapourPressure,
} from "./eregister-derived";

type Values = Record<string, string>;
/** What the readings may need besides the keyed values: the station settings. */
export interface ReadingContext {
  station?: StationSettings | null;
}
type Reading = (values: Values, context?: ReadingContext) => string | null;

/** Shown where a calculated value waits for a station setting. */
export const PENDING_DASH = "—";

const DIGITS = /^\d+$/;
const TENTHS_GROUP = /^\d{3,4}$/;
const KM_90_99 = [
  "<0.05",
  "0.05",
  "0.2",
  "0.5",
  "1",
  "2",
  "4",
  "10",
  "20",
  "≥50",
];
// Direction of cloud drift (Code table 0 20 054 as used in group 56DLDMDH).
const DRIFT = ["Still", "NE", "E", "SE", "S", "SW", "W", "NW", "N", "Var."];
// 6-hr period tR: hours the precipitation amount covers.
const PERIOD_HOURS = [null, 6, 12, 18, 24, 1, 2, 3, 9, 15];
const PRESSURE_THOUSANDS_BOUNDARY = 5000;
const TRACE_RRR = 990;
const TRACE_R24 = 9999;
const OVER_21KM_CODE = 89;
const OBSCURED_SKY = 9;
// Entries that show a register row holds an observation (not an empty form).
const OBSERVATION_KEYS = [
  "air_temp",
  "wet_bulb",
  "wind_speed",
  "visibility",
  "visibility_km",
  "station_pressure",
  "msl_pressure",
  "total_cloud",
  "barometer_reading",
];
const ONE_DECIMAL = 1;

function digits(value: string | undefined, length: number): number | "" | null {
  const text = (value ?? "").trim();
  if (text === "") return "";
  if (!DIGITS.test(text) || text.length !== length) return null;
  return Number(text);
}

export function tenthsToCelsius(group: string | undefined): number | null {
  if (!(group && TENTHS_GROUP.test(group))) return null;
  // A four-digit group starts with the sign digit: 0 positive, 1 negative.
  if (group.length === 4 && !"01".includes(group.charAt(0))) return null;
  const negative = group.length === 4 && group.startsWith("1");
  return (negative ? -1 : 1) * (Number(group.slice(-3)) / 10);
}

function temperature(key: string): Reading {
  return (values) => {
    const group = (values[key] ?? "").trim();
    if (group === "") return "";
    const degrees = tenthsToCelsius(group);
    return degrees === null ? null : degrees.toFixed(1);
  };
}

function pressure(key: string): Reading {
  return (values) => {
    const group = digits(values[key], 4);
    if (group === "" || group === null) return group;
    const thousands = group >= PRESSURE_THOUSANDS_BOUNDARY ? 0 : 1000;
    return (group / 10 + thousands).toFixed(1);
  };
}

function computedHpa(result: Computed): string | undefined {
  if (result.state === "pending") return PENDING_DASH;
  if (result.state === "value") return result.hpa.toFixed(ONE_DECIMAL);
}

// QFE over the station pressure group: barometer as read plus corrections.
// Without a barometer reading the keyed group is decoded, as before.
function qfeReading(values: Values, context?: ReadingContext): string | null {
  return (
    computedHpa(qfe(values, context?.station)) ??
    pressure("station_pressure")(values)
  );
}

// QNH over the MSL pressure group: QFE reduced with the station elevation.
function qnhReading(values: Values, context?: ReadingContext): string | null {
  return (
    computedHpa(qnh(values, context?.station)) ??
    pressure("msl_pressure")(values)
  );
}

// Column 17: the total barometer corrections, from the station settings.
function correctionReading(
  _values: Values,
  context?: ReadingContext
): string | null {
  const correction = context?.station?.barometerCorrectionHpa;
  if (correction === null || correction === undefined) return PENDING_DASH;
  const sign = correction > 0 ? "+" : "";
  return `${sign}${correction.toFixed(ONE_DECIMAL)}`;
}

function drift(key: string): Reading {
  return (values) => {
    const n = digits(values[key], 1);
    if (n === "" || n === null) return n;
    return DRIFT[n] ?? null;
  };
}

// hshshs: the cloud base in hundreds of feet (owner decision, 2026-10-23).
function layerHeight(key: string): Reading {
  return (values) => {
    const code = digits(values[key], 2);
    if (code === "" || code === null) return code;
    const metres = layerHeightMetres(code);
    if (metres === null) return null;
    // 89 is above 21 000 m: the lower bound with a greater-than sign.
    return code === OVER_21KM_CODE
      ? `>${hundredsOfFeet(metres)}`
      : hundredsOfFeet(metres);
  };
}

// Layer amount Ns in oktas (9 is an obscured sky).
function layerAmount(key: string): Reading {
  return (values) => {
    const n = digits(values[key], 1);
    if (n === "" || n === null) return n;
    return n === OBSCURED_SKY ? "Obs" : String(n);
  };
}

function visibility(values: Values): string | null {
  const code = digits(values.visibility, 2);
  if (code === "" || code === null) return code;
  if (code === 0) return "<0.1";
  if (code <= 50) return (code / 10).toFixed(1);
  if (code <= 55) return null; // 51 to 55 are not used
  if (code <= 80) return String(code - 50);
  if (code <= 88) return String(30 + (code - 80) * 5);
  if (code === 89) return ">70";
  return KM_90_99[code - 90] ?? null;
}

function windDirection(values: Values): string | null {
  const dd = digits(values.wind_dir, 2);
  if (dd === "" || dd === null) return dd;
  if (dd === 99) return "VRB";
  if (dd > 36) return null;
  return String(dd * 10).padStart(3, "0");
}

// Vapour pressure (hPa): from the dry and wet bulb when both are keyed,
// otherwise from the dew point (Magnus formula; display only).
function vapourPressure(values: Values): string | null {
  const humidity = humidityFromValues(values);
  if (humidity) return humidity.vapourPressure.toFixed(ONE_DECIMAL);
  const group = (values.dew_point ?? "").trim();
  if (group === "") return "";
  const dew = tenthsToCelsius(group);
  if (dew === null) return null;
  return saturationVapourPressure(dew).toFixed(ONE_DECIMAL);
}

function hasObservation(values: Values): boolean {
  return OBSERVATION_KEYS.some((key) => (values[key] ?? "").trim() !== "");
}

// Column 23: the word "Nil" where nothing is reported (owner decision,
// 2026-10-23), once the row holds an observation.
function rainfall(values: Values): string | null {
  const n = digits(values.precip_amount, 3);
  if (n === "") return hasObservation(values) ? "Nil" : "";
  if (n === null) return n;
  if (n === 0) return "Nil";
  if (n === TRACE_RRR) return "Trace";
  return n > TRACE_RRR ? ((n - TRACE_RRR) / 10).toFixed(1) : String(n);
}

function rainfallPeriod(values: Values): string | null {
  const n = digits(values.precip_period, 1);
  if (n === "" || n === null) return n;
  const hours = PERIOD_HOURS[n];
  return hours ? String(hours) : null;
}

function rainfall24h(values: Values): string | null {
  const n = digits(values.s3_rainfall_24h, 4);
  if (n === "" || n === null) return n;
  return n === TRACE_R24 ? "Trace" : (n / 10).toFixed(1);
}

// 24 h pressure change: j1 8 (rise or zero, group 58) or 9 (fall, group 59) then
// P24P24P24 in tenths of hPa. A legacy 0 or 1 still reads (the API warns).
const PRESSURE_RISE_J1 = "80";
const PRESSURE_FALL_J1 = "91";

function pressureChange24h(values: Values): string | null {
  const group = (values.s3_baro_change_24h ?? "").trim();
  if (group === "") return "";
  if (group.length !== 4 || !DIGITS.test(group)) return null;
  const hpa = Number(group.slice(1)) / 10;
  if (PRESSURE_FALL_J1.includes(group.charAt(0))) {
    return hpa === 0 ? "0.0" : `-${hpa.toFixed(1)}`;
  }
  if (PRESSURE_RISE_J1.includes(group.charAt(0))) return `+${hpa.toFixed(1)}`;
  return null;
}

/** Fields that have a plain reading, keyed like the register values. */
export const READINGS: Record<string, Reading> = {
  visibility,
  wind_dir: windDirection,
  air_temp: temperature("air_temp"),
  dew_point: temperature("dew_point"),
  relative_humidity: vapourPressure,
  barometer_reading: correctionReading,
  station_pressure: qfeReading,
  msl_pressure: qnhReading,
  precip_amount: rainfall,
  precip_period: rainfallPeriod,
  s3_cloud_dir_low: drift("s3_cloud_dir_low"),
  s3_cloud_dir_mid: drift("s3_cloud_dir_mid"),
  s3_cloud_dir_high: drift("s3_cloud_dir_high"),
  s3_max_temp: temperature("s3_max_temp"),
  s3_min_temp: temperature("s3_min_temp"),
  s3_baro_change_24h: pressureChange24h,
  s3_rainfall_24h: rainfall24h,
  s3_layer1_amount: layerAmount("s3_layer1_amount"),
  s3_layer2_amount: layerAmount("s3_layer2_amount"),
  s3_layer3_amount: layerAmount("s3_layer3_amount"),
  s3_layer4_amount: layerAmount("s3_layer4_amount"),
  s3_layer1_height: layerHeight("s3_layer1_height"),
  s3_layer2_height: layerHeight("s3_layer2_height"),
  s3_layer3_height: layerHeight("s3_layer3_height"),
  s3_layer4_height: layerHeight("s3_layer4_height"),
};
