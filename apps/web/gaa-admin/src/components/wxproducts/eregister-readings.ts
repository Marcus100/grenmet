// Plain readings (no units, as on the paper register) shown above the coded entry in the register, like the
// two-layer cells on the paper register ("18" over VV "68", "1015.3" over
// "0153"). Display only: the API validates and decodes authoritatively.
// A reading is "" while the cell is empty and null when the code is not valid.

type Values = Record<string, string>;
type Reading = (values: Values) => string | null;

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

function drift(key: string): Reading {
  return (values) => {
    const n = digits(values[key], 1);
    if (n === "" || n === null) return n;
    return DRIFT[n] ?? null;
  };
}

function layerHeight(key: string): Reading {
  return (values) => {
    const code = digits(values[key], 2);
    if (code === "" || code === null) return code;
    if (code <= 50) return String(code * 30);
    if (code >= 56 && code <= 80) return String((code - 50) * 300);
    // 81 to 88 climb from 10 500 m in 1500 m steps; 89 is above 21 000 m.
    if (code >= 81 && code <= 88) return String(10_500 + (code - 81) * 1500);
    if (code === 89) return ">21000";
    return null;
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

// Vapour pressure (hPa) from the dew point, Magnus formula (display only).
function vapourPressure(values: Values): string | null {
  const group = (values.dew_point ?? "").trim();
  if (group === "") return "";
  const dew = tenthsToCelsius(group);
  if (dew === null) return null;
  return (6.1094 * Math.exp((17.625 * dew) / (243.04 + dew))).toFixed(1);
}

function rainfall(values: Values): string | null {
  const n = digits(values.precip_amount, 3);
  if (n === "" || n === null) return n;
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

/** Fields that have a plain reading, keyed like the register values. */
export const READINGS: Record<string, Reading> = {
  visibility,
  wind_dir: windDirection,
  air_temp: temperature("air_temp"),
  dew_point: temperature("dew_point"),
  relative_humidity: vapourPressure,
  station_pressure: pressure("station_pressure"),
  msl_pressure: pressure("msl_pressure"),
  precip_amount: rainfall,
  precip_period: rainfallPeriod,
  s3_cloud_dir_low: drift("s3_cloud_dir_low"),
  s3_cloud_dir_mid: drift("s3_cloud_dir_mid"),
  s3_cloud_dir_high: drift("s3_cloud_dir_high"),
  s3_max_temp: temperature("s3_max_temp"),
  s3_min_temp: temperature("s3_min_temp"),
  s3_rainfall_24h: rainfall24h,
  s3_layer1_height: layerHeight("s3_layer1_height"),
  s3_layer2_height: layerHeight("s3_layer2_height"),
  s3_layer3_height: layerHeight("s3_layer3_height"),
  s3_layer4_height: layerHeight("s3_layer4_height"),
};
