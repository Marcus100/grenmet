// Values the register calculates instead of asking the observer to key (owner
// decisions, 2026-10-23). The same formulas run in the API
// (`apps/api/fastapi/src/eregister/derive.py`), which is authoritative on save;
// this copy only fills the grey cells while the observer types.
//
// - Visibility is typed in kilometres; the coded VV (Code table 4377) follows.
// - Dew point, vapour pressure and relative humidity come from the dry bulb,
//   the wet bulb and the keyed station pressure (psychrometer equation with the
//   Magnus formula over water).
// - Pressures use the station's fixed amounts (owner confirmed for 78958 on
//   2026-10-24): station pressure = barometer as read + total correction (0.0);
//   QFE = station + 0.3; mean sea level = station + 1.0; QNH = sea level + 0.1.
//   Barometer 1012.8 gives station 1012.8 (group 3 0128), QFE 1013.1, sea level
//   1013.8 (group 4 0138) and QNH 1013.9. A keyed group 3 or 4 is kept. All the
//   arithmetic is in whole tenths of hPa, so no floating point drift.

type Values = Record<string, string>;

/** A station's fixed pressure amounts in hPa; null while not supplied. */
export interface StationSettings {
  qfeOffsetHpa: number | null;
  qnhOffsetHpa: number | null;
  seaLevelOffsetHpa: number | null;
  totalCorrectionHpa: number | null;
}

const MAGNUS_A = 6.1094;
const MAGNUS_B = 17.625;
const MAGNUS_C = 243.04;
const PSYCHROMETER_A = 0.000_66;
const PSYCHROMETER_TW_FACTOR = 0.001_15;
const PRESSURE_THOUSANDS_BOUNDARY = 5000;
const PRESSURE_MIN_HPA = 500;
const PRESSURE_MAX_HPA = 1085.7;
const PERCENT = 100;
const GROUP_TTT = 3;
const GROUP_SN_TTT = 4;
const FLOAT_GUARD = 1e-9;

const BAROMETER_MAX_HPA = 1100;
const TENTHS_PER_HPA = 10;
const GROUP_MODULO = 10_000;
const PRESSURE_GROUP_DIGITS = 4;

const FEET_PER_METRE = 3.280_84;
const FEET_PER_HUNDRED = 100;

const DIGITS_ONLY = /^\d+$/;
const FOUR_DIGITS = /^\d{4}$/;
const KM_PATTERN = /^\d+(\.\d+)?$/;
const BAROMETER_PATTERN = /^\d{3,4}(\.\d)?$/;
const FINE_MAX_KM = 5;
const FINE_MAX_CODE = 50;
const WHOLE_KM_MAX = 30;
const WHOLE_KM_MAX_CODE = 80;
const COARSE_STEP_KM = 5;
const COARSE_MAX_KM = 70;
const OVER_70KM_CODE = 89;
const KM_CODE_OFFSET = 50;
const KM_LIMIT = 1000;

/** Typed kilometres to Code table 4377 VV; "" while empty, null if not a number. */
export function visibilityCodeFromKm(text: string | undefined): string | null {
  const value = (text ?? "").trim();
  if (value === "") return "";
  if (!KM_PATTERN.test(value)) return null;
  const km = Number(value);
  if (km >= KM_LIMIT) return null;
  let code: number;
  if (km <= FINE_MAX_KM) code = Math.floor(km * 10 + FLOAT_GUARD);
  else if (km < FINE_MAX_KM + 1)
    code = FINE_MAX_CODE; // 51 to 55 are unused
  else if (km <= WHOLE_KM_MAX) code = KM_CODE_OFFSET + Math.floor(km);
  else if (km < WHOLE_KM_MAX + COARSE_STEP_KM) code = WHOLE_KM_MAX_CODE;
  else if (km <= COARSE_MAX_KM) {
    code = WHOLE_KM_MAX_CODE + Math.floor((km - WHOLE_KM_MAX) / COARSE_STEP_KM);
  } else code = OVER_70KM_CODE;
  return String(code).padStart(2, "0");
}

function tenths(group: string | undefined): number | null {
  const value = (group ?? "").trim();
  if (!DIGITS_ONLY.test(value)) return null;
  if (value.length !== GROUP_TTT && value.length !== GROUP_SN_TTT) return null;
  let negative = false;
  if (value.length === GROUP_SN_TTT) {
    if (!"01".includes(value.charAt(0))) return null;
    negative = value.startsWith("1");
  }
  const degrees = Number(value.slice(-GROUP_TTT)) / 10;
  return negative ? -degrees : degrees;
}

/** snTTT (four digits); rounds half away from zero, never a negative zero. */
export function temperatureGroup(celsius: number): string {
  const rounded = Math.floor(Math.abs(celsius) * 10 + 0.5);
  const sign = celsius < 0 && rounded > 0 ? "1" : "0";
  return `${sign}${String(rounded).padStart(GROUP_TTT, "0")}`;
}

function stationPressureHpa(group: string | undefined): number | null {
  const value = (group ?? "").trim();
  if (!FOUR_DIGITS.test(value)) return null;
  const number = Number(value);
  const hpa = number / 10 + (number >= PRESSURE_THOUSANDS_BOUNDARY ? 0 : 1000);
  return hpa >= PRESSURE_MIN_HPA && hpa <= PRESSURE_MAX_HPA ? hpa : null;
}

export function saturationVapourPressure(celsius: number): number {
  return MAGNUS_A * Math.exp((MAGNUS_B * celsius) / (MAGNUS_C + celsius));
}

export interface Humidity {
  dewPoint: number;
  relativeHumidity: number;
  vapourPressure: number;
}

/** Dew point, vapour pressure and relative humidity from dry and wet bulb. */
export function humidityFromValues(values: Values): Humidity | null {
  const dry = tenths(values.air_temp);
  const wet = tenths(values.wet_bulb);
  const pressure = stationPressureHpa(values.station_pressure);
  if (dry === null || wet === null || pressure === null || wet > dry) {
    return null;
  }
  const coefficient = PSYCHROMETER_A * (1 + PSYCHROMETER_TW_FACTOR * wet);
  const vapour =
    saturationVapourPressure(wet) - coefficient * pressure * (dry - wet);
  if (vapour <= 0) return null;
  const ratio = Math.log(vapour / MAGNUS_A);
  const dewPoint = Math.min((MAGNUS_C * ratio) / (MAGNUS_B - ratio), dry);
  const percent = Math.round(
    (vapour / saturationVapourPressure(dry)) * PERCENT
  );
  return {
    dewPoint,
    relativeHumidity: Math.max(0, Math.min(PERCENT, percent)),
    vapourPressure: vapour,
  };
}

function groupTenths(group: string | undefined): number | null {
  const value = (group ?? "").trim();
  if (!FOUR_DIGITS.test(value)) return null;
  const number = Number(value);
  return number >= PRESSURE_THOUSANDS_BOUNDARY ? number : number + GROUP_MODULO;
}

function barometerTenths(values: Values): number | null {
  const text = (values.barometer_reading ?? "").trim();
  if (!BAROMETER_PATTERN.test(text)) return null;
  const hpa = Number(text);
  if (hpa < PRESSURE_MIN_HPA || hpa > BAROMETER_MAX_HPA) return null;
  return Math.round(hpa * TENTHS_PER_HPA);
}

function amountTenths(value: number | null | undefined): number | null {
  return value === null || value === undefined
    ? null
    : Math.round(value * TENTHS_PER_HPA);
}

function plus(base: number | null, amount: number | null): number | null {
  return base === null || amount === null ? null : base + amount;
}

/** Pressures in whole tenths of hPa; null where a source or amount is missing. */
export interface Pressures {
  qfe: number | null;
  qnh: number | null;
  seaLevel: number | null;
  seaLevelFromStation: number | null;
  station: number | null;
  stationFromBarometer: number | null;
}

/** Station, sea level, QFE and QNH; a keyed group 3 or 4 wins over the rule. */
export function pressures(
  values: Values,
  settings: StationSettings | null | undefined
): Pressures {
  const fromBarometer = plus(
    barometerTenths(values),
    amountTenths(settings?.totalCorrectionHpa)
  );
  const station = groupTenths(values.station_pressure) ?? fromBarometer;
  const fromStation = plus(station, amountTenths(settings?.seaLevelOffsetHpa));
  const seaLevel = groupTenths(values.msl_pressure) ?? fromStation;
  return {
    qfe: plus(station, amountTenths(settings?.qfeOffsetHpa)),
    qnh: plus(seaLevel, amountTenths(settings?.qnhOffsetHpa)),
    seaLevel,
    seaLevelFromStation: fromStation,
    station,
    stationFromBarometer: fromBarometer,
  };
}

/** Four digits in tenths of hPa with the thousands omitted (10128 -> "0128"). */
export function pressureGroup(tenths: number): string {
  return String(tenths % GROUP_MODULO).padStart(PRESSURE_GROUP_DIGITS, "0");
}

/** Groups 3 and 4 the rule fills in where the observer left them blank. */
export function pressureFields(
  values: Values,
  settings: StationSettings | null | undefined
): Values {
  const found = pressures(values, settings);
  const derived: Values = {};
  if (
    (values.station_pressure ?? "").trim() === "" &&
    found.stationFromBarometer !== null
  ) {
    derived.station_pressure = pressureGroup(found.stationFromBarometer);
  }
  if (
    (values.msl_pressure ?? "").trim() === "" &&
    found.seaLevelFromStation !== null
  ) {
    derived.msl_pressure = pressureGroup(found.seaLevelFromStation);
  }
  return derived;
}

/** The coded fields the register calculates, when their sources are usable. */
export function deriveCoded(
  values: Values,
  settings?: StationSettings | null
): Values {
  // Pressures first: the humidity calculation uses the station pressure.
  const derived: Values = pressureFields(values, settings);
  const merged = { ...values, ...derived };
  const code = visibilityCodeFromKm(merged.visibility_km);
  if (code) derived.visibility = code;
  const humidity = humidityFromValues(merged);
  if (humidity) {
    derived.dew_point = temperatureGroup(humidity.dewPoint);
    derived.relative_humidity = String(humidity.relativeHumidity);
  }
  return derived;
}

/** The stored values with the calculated fields filled in (what the grid shows). */
export function withDerived(
  values: Values,
  settings?: StationSettings | null
): Values {
  return { ...values, ...deriveCoded(values, settings) };
}

export type Computed =
  /** Nothing keyed yet to work from: nothing to show. */
  | { state: "empty" }
  /** A station amount is still missing: show a dash and the pending note. */
  | { state: "pending" }
  | { hpa: number; state: "value" };

function hasPressureSource(values: Values): boolean {
  return (
    barometerTenths(values) !== null ||
    groupTenths(values.station_pressure) !== null ||
    groupTenths(values.msl_pressure) !== null
  );
}

function computed(values: Values, tenths: number | null): Computed {
  if (tenths !== null) return { hpa: tenths / TENTHS_PER_HPA, state: "value" };
  return hasPressureSource(values) ? { state: "pending" } : { state: "empty" };
}

/** QFE: station pressure plus the station's QFE offset. */
export function qfe(
  values: Values,
  settings: StationSettings | null | undefined
): Computed {
  return computed(values, pressures(values, settings).qfe);
}

/** QNH: mean sea level pressure plus the station's QNH offset. */
export function qnh(
  values: Values,
  settings: StationSettings | null | undefined
): Computed {
  return computed(values, pressures(values, settings).qnh);
}

/** True while any of the station's pressure amounts is empty. */
export function settingsPending(
  settings: StationSettings | null | undefined
): boolean {
  return (
    settings === null ||
    settings === undefined ||
    settings.totalCorrectionHpa === null ||
    settings.qfeOffsetHpa === null ||
    settings.seaLevelOffsetHpa === null ||
    settings.qnhOffsetHpa === null
  );
}

/** Cloud base height code (hshs) to metres, or null for an unused code. */
export function layerHeightMetres(code: number): number | null {
  if (code <= FINE_MAX_CODE) return code * 30;
  if (code >= 56 && code <= WHOLE_KM_MAX_CODE) return (code - 50) * 300;
  if (code >= 81 && code <= 88) return 10_500 + (code - 81) * 1500;
  if (code === OVER_70KM_CODE) return 21_000; // above 21 000 m: lower bound
  return null;
}

/** hshshs: the base height in hundreds of feet, three digits ("018"). */
export function hundredsOfFeet(metres: number): string {
  const hundreds = Math.round((metres * FEET_PER_METRE) / FEET_PER_HUNDRED);
  return String(hundreds).padStart(3, "0");
}
