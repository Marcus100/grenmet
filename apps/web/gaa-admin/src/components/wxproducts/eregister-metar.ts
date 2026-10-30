import { tenthsToCelsius } from "./eregister-readings";

// Illustrative METAR built from the coded SYNOP workbook so the observer can
// compare the two. It is a preview, not a transmitted message: QNH is taken
// from the MSL pressure group, rounded down; once checked, the server's
// expected METAR (which applies the station's QNH offset) replaces it, and missing elements use the automatic-station
// placeholders (/////KT, ////, //////). The API validates; this only renders.

type Values = Record<string, string>;

const KNOTS_PER_MS = 1.943_84;
const FEET_PER_METRE = 3.280_84;
const FEW_MAX = 2;
const SCT_MAX = 4;
const BKN_MAX = 7;
const OBSCURED = 9;
const VV_OVER_10_KM = 60;
const VV_KM_MIN = 56;
const CB_FORM = 9;
const CODE_30M_MAX = 50;
const CODE_300M_MIN = 56;
const CODE_300M_MAX = 80;
const CODE_1500M_MIN = 81;
const CODE_1500M_MAX = 88; // 89 is above 21 000 m: use the lower bound
const CODE_ABOVE_21KM = 89;
const PRESSURE_THOUSANDS_BOUNDARY = 5000;
const TEN_THOUSAND_FEET = 100;
// Visibility VV 90..99 (Code table 4377) as METAR metres.
const VV_90_99_M = [
  "0000",
  "0050",
  "0200",
  "0500",
  "1000",
  "2000",
  "4000",
  "9999",
  "9999",
  "9999",
];
const DIGITS = /^\d+$/;

function digits(value: string | undefined, length: number): number | null {
  const text = (value ?? "").trim();
  return DIGITS.test(text) && text.length === length ? Number(text) : null;
}

export function windGroup(v: Values): string {
  const direction = digits(v.wind_dir, 2);
  const raw = digits(v.wind_speed, 2) ?? digits(v.wind_speed, 3);
  if (direction === null || raw === null) return "/////KT";
  const metres = v.wind_indicator === "0" || v.wind_indicator === "1";
  const knots = metres ? Math.round(raw * KNOTS_PER_MS) : raw;
  const speed = String(knots).padStart(2, "0");
  if (direction === 99) return `VRB${speed}KT`;
  if (direction > 36) return "/////KT";
  // dd 00 with a speed is not a valid pair (calm is 00/00): show it as missing.
  if (direction === 0 && knots > 0) return "/////KT";
  const degrees = direction * 10;
  let gust = "";
  const gustRaw = digits(v.wind_gust, 2) ?? digits(v.wind_gust, 3);
  if (gustRaw !== null) {
    const gustKnots = metres ? Math.round(gustRaw * KNOTS_PER_MS) : gustRaw;
    // Gusts are reported when they exceed the mean by 10 kt or more.
    if (gustKnots - knots >= 10)
      gust = `G${String(gustKnots).padStart(2, "0")}`;
  }
  return `${String(degrees).padStart(3, "0")}${speed}${gust}KT`;
}

export function visibilityGroup(code: string | undefined): string {
  const vv = digits(code, 2);
  if (vv === null) return "////";
  if (vv >= 90) return VV_90_99_M[vv - 90] ?? "////";
  if (vv >= VV_OVER_10_KM) return "9999";
  if (vv >= VV_KM_MIN) return `${String((vv - 50) * 1000).padStart(4, "0")}`;
  if (vv > CODE_30M_MAX) return "////"; // 51 to 55 are not used
  return String(vv * 100).padStart(4, "0");
}

function layerFeet(code: number): number | null {
  let metres: number | null = null;
  if (code <= CODE_30M_MAX) metres = code * 30;
  else if (code >= CODE_300M_MIN && code <= CODE_300M_MAX) {
    metres = (code - 50) * 300;
  } else if (code >= CODE_1500M_MIN && code <= CODE_1500M_MAX) {
    metres = 10_500 + (code - CODE_1500M_MIN) * 1500;
  } else if (code === CODE_ABOVE_21KM) metres = 21_000;
  return metres === null ? null : metres * FEET_PER_METRE;
}

/** Hundreds of feet, METAR-rounded: 100 ft steps to 10 000 ft, then 1000 ft. */
export function heightGroup(code: number): string | null {
  const feet = layerFeet(code);
  if (feet === null) return null;
  let hundreds = Math.round(feet / 100);
  if (hundreds >= TEN_THOUSAND_FEET) hundreds = Math.round(hundreds / 10) * 10;
  return String(hundreds).padStart(3, "0");
}

function amountWord(oktas: number): string | null {
  if (oktas < 1 || oktas > 8) return null;
  if (oktas <= FEW_MAX) return "FEW";
  if (oktas <= SCT_MAX) return "SCT";
  return oktas <= BKN_MAX ? "BKN" : "OVC";
}

export function cloudGroups(v: Values): string {
  const total = digits(v.total_cloud, 1);
  if (total === null) return "//////";
  if (total === 0) return "NSC";
  if (total === OBSCURED) return "VV///";
  const groups: string[] = [];
  for (const n of [1, 2, 3, 4]) {
    const amount = digits(v[`s3_layer${n}_amount`], 1);
    const form = digits(v[`s3_layer${n}_form`], 1);
    const height = digits(v[`s3_layer${n}_height`], 2);
    const word = amount === null ? null : amountWord(amount);
    if (word) {
      const base = height === null ? "///" : (heightGroup(height) ?? "///");
      groups.push(`${word}${base}${form === CB_FORM ? "CB" : ""}`);
    }
  }
  // Layers not entered: fall back to the total amount with the base unknown.
  return groups.length > 0
    ? groups.join(" ")
    : `${amountWord(total) ?? "///"}///`;
}

export function temperatureGroup(group: string | undefined): string {
  const value = tenthsToCelsius(group);
  if (value === null) return "//";
  const rounded = Math.round(Math.abs(value)).toString().padStart(2, "0");
  return value < 0 ? `M${rounded}` : rounded;
}

export function pressureGroup(group: string | undefined): string {
  const value = digits(group, 4);
  if (value === null) return "Q////";
  const hpa = value / 10 + (value >= PRESSURE_THOUSANDS_BOUNDARY ? 0 : 1000);
  return `Q${String(Math.floor(hpa)).padStart(4, "0")}`;
}

/** `iso` is an ISO-8601 UTC time, e.g. 2026-09-29T12:00:00.000Z. */
export function metarFromCoded(iso: string, v: Values): string {
  const time = `${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
  const visibility = visibilityGroup(v.visibility);
  const cloud = cloudGroups(v);
  return [
    "METAR TGPY",
    time,
    windGroup(v),
    visibility,
    cloud,
    `${temperatureGroup(v.air_temp)}/${temperatureGroup(v.dew_point)}`,
    `${pressureGroup(v.msl_pressure)}=`,
  ].join(" ");
}
