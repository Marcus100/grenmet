// Values the register calculates instead of asking the observer to key (owner
// decisions, 2026-10-23). The same formulas run in the API
// (`apps/api/fastapi/src/eregister/derive.py`), which is authoritative on save;
// this copy only fills the grey cells while the observer types.
//
// - Visibility is typed in kilometres; the coded VV (Code table 4377) follows.
// - Dew point, vapour pressure and relative humidity come from the dry bulb,
//   the wet bulb and the keyed station pressure (psychrometer equation with the
//   Magnus formula over water).
// - QFE is the barometer as read plus the total corrections; QNH reduces QFE to
//   sea level with the standard atmosphere and the station elevation. Neither
//   the corrections nor the elevation are known yet, so nothing is assumed:
//   without them QFE and QNH are unavailable.

type Values = Record<string, string>;

export interface StationSettings {
  barometerCorrectionHpa: number | null;
  elevationM: number | null;
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

// Standard atmosphere: QNH = QFE / (1 - L h / T0) ^ (g / (R L)).
const LAPSE_K_PER_M = 0.0065;
const SEA_LEVEL_TEMPERATURE_K = 288.15;
const STANDARD_EXPONENT = 5.255_88;

const FEET_PER_METRE = 3.280_84;
const FEET_PER_HUNDRED = 100;

const DIGITS_ONLY = /^\d+$/;
const FOUR_DIGITS = /^\d{4}$/;
const KM_PATTERN = /^\d+(\.\d+)?$/;
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

/** The coded fields the register calculates, when their sources are usable. */
export function deriveCoded(values: Values): Values {
  const derived: Values = {};
  const code = visibilityCodeFromKm(values.visibility_km);
  if (code) derived.visibility = code;
  const humidity = humidityFromValues(values);
  if (humidity) {
    derived.dew_point = temperatureGroup(humidity.dewPoint);
    derived.relative_humidity = String(humidity.relativeHumidity);
  }
  return derived;
}

/** The stored values with the calculated fields filled in (what the grid shows). */
export function withDerived(values: Values): Values {
  return { ...values, ...deriveCoded(values) };
}

function barometer(values: Values): number | null {
  const text = (values.barometer_reading ?? "").trim();
  if (!KM_PATTERN.test(text)) return null;
  const hpa = Number(text);
  return hpa >= PRESSURE_MIN_HPA && hpa <= PRESSURE_MAX_HPA ? hpa : null;
}

export type Computed =
  /** Barometer not keyed yet: nothing to show. */
  | { state: "empty" }
  /** A setting is still missing: show a dash and the pending note. */
  | { state: "pending" }
  | { hpa: number; state: "value" };

/** QFE: the barometer as read plus the total corrections. */
export function qfe(
  values: Values,
  settings: StationSettings | null | undefined
): Computed {
  const reading = barometer(values);
  if (reading === null) return { state: "empty" };
  const correction = settings?.barometerCorrectionHpa;
  if (correction === null || correction === undefined) {
    return { state: "pending" };
  }
  return { hpa: reading + correction, state: "value" };
}

/** QNH: QFE reduced to mean sea level with the station elevation. */
export function qnh(
  values: Values,
  settings: StationSettings | null | undefined
): Computed {
  const station = qfe(values, settings);
  if (station.state !== "value") return station;
  const elevation = settings?.elevationM;
  if (elevation === null || elevation === undefined) {
    return { state: "pending" };
  }
  const factor =
    (1 - (LAPSE_K_PER_M * elevation) / SEA_LEVEL_TEMPERATURE_K) **
    STANDARD_EXPONENT;
  return { hpa: station.hpa / factor, state: "value" };
}

/** True when QFE or QNH cannot be calculated because a station setting is empty. */
export function settingsPending(
  settings: StationSettings | null | undefined
): boolean {
  return (
    settings === null ||
    settings === undefined ||
    settings.barometerCorrectionHpa === null ||
    settings.elevationM === null
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
