/**
 * Metric and imperial units for every measurement on the site (owner, 28 Oct
 * 2026). The API stores and sends WMO units (degC, knots, metres, km, hPa, mm);
 * a visitor sees them in whichever system they chose, metric until they do.
 * Both renderings are on the page and CSS shows one, so a static page never
 * flashes the wrong units (`components/measure.tsx`, `globals.css`).
 */

export type UnitSystem = "imperial" | "metric";
export const UNIT_SYSTEMS: readonly UnitSystem[] = ["imperial", "metric"];

/** Until a visitor chooses: metric (owner, 28 Oct 2026, after first choosing imperial). */
export const DEFAULT_UNITS: UnitSystem = "metric";
export const UNITS_STORAGE_KEY = "gm-units";

/** What a number measures, in the unit the API sends it in. */
export type Quantity =
  | "distance" // km
  | "height" // metres
  | "pressure" // hPa
  | "rain" // mm
  | "speed" // knots
  | "temperature"; // degC

/** A measurement, or a range of them, with an optional word before it ("ESE "). */
export interface Measure {
  /** A temperature as "31°", without the F or C, for big numerals and tabs. */
  bare?: boolean;
  /** Upper end of a range; omit for a single value. */
  high?: number | null;
  low: number | null;
  /** Decimal places, instead of the quantity's usual ones (e.g. 0 for the big temperature). */
  places?: number;
  /** Text before the figure, e.g. a wind direction and a space. */
  prefix?: string;
  quantity: Quantity;
}

const KNOTS_TO_MPH = 1852 / 1609.344;
const KNOTS_TO_KMH = 1.852;
const METRES_TO_FEET = 1 / 0.3048;
const KM_TO_MILES = 1000 / 1609.344;
const HPA_TO_INHG = 0.029_529_983_071_4;
const MM_TO_INCHES = 1 / 25.4;

interface UnitSpec {
  /** Convert from the API's unit. */
  convert: (value: number) => number;
  /** Decimal places shown. */
  places: number;
  /** Text after the figure, e.g. " mph" or "°". */
  suffix: string;
}

const SPECS: Record<Quantity, Record<UnitSystem, UnitSpec>> = {
  temperature: {
    imperial: {
      convert: (c) => (c * 9) / 5 + 32,
      places: 0,
      suffix: "°F",
    },
    metric: { convert: (c) => c, places: 1, suffix: "°C" },
  },
  speed: {
    imperial: { convert: (kt) => kt * KNOTS_TO_MPH, places: 0, suffix: " mph" },
    metric: { convert: (kt) => kt * KNOTS_TO_KMH, places: 0, suffix: " km/h" },
  },
  height: {
    imperial: { convert: (m) => m * METRES_TO_FEET, places: 0, suffix: " ft" },
    metric: { convert: (m) => m, places: 1, suffix: " m" },
  },
  distance: {
    imperial: { convert: (km) => km * KM_TO_MILES, places: 1, suffix: " mi" },
    metric: { convert: (km) => km, places: 1, suffix: " km" },
  },
  pressure: {
    imperial: {
      convert: (hpa) => hpa * HPA_TO_INHG,
      places: 2,
      suffix: " inHg",
    },
    metric: { convert: (hpa) => hpa, places: 1, suffix: " hPa" },
  },
  rain: {
    imperial: { convert: (mm) => mm * MM_TO_INCHES, places: 2, suffix: " in" },
    metric: { convert: (mm) => mm, places: 1, suffix: " mm" },
  },
};

/** A figure to `places` decimals without a trailing ".0": 31.5, 32, 0.25. */
function figure(value: number, places: number): string {
  return Number(value.toFixed(places)).toString();
}

/** The figure for one value in one system, without its unit. */
export function convertFigure(
  quantity: Quantity,
  value: number,
  system: UnitSystem
): string {
  const spec = SPECS[quantity][system];
  return figure(spec.convert(value), spec.places);
}

/** The unit text for a quantity in a system, e.g. " mph", "°C". */
export function unitSuffix(quantity: Quantity, system: UnitSystem): string {
  return SPECS[quantity][system].suffix;
}

/**
 * "8–13 mph", "31.5°C", "29.92 inHg": the measure in one system. Null when it
 * has no figure. A range whose two ends round the same collapses to one value.
 */
export function formatMeasure(
  measure: Measure,
  system: UnitSystem
): string | null {
  const { quantity, low, high } = measure;
  const ends = [low, high].filter(
    (value): value is number => value !== null && value !== undefined
  );
  if (ends.length === 0) return null;
  const spec = SPECS[quantity][system];
  const places = measure.places ?? spec.places;
  const shown = ends.map((value) => figure(spec.convert(value), places));
  const first = shown[0];
  const last = shown.at(-1);
  const text = first === last ? first : `${first}–${last}`;
  const suffix = measure.bare && quantity === "temperature" ? "°" : spec.suffix;
  return `${measure.prefix ?? ""}${text}${suffix}`;
}

/** A single value as its figure and its unit, e.g. "0.37" and "in"; null without a figure. */
export function measureParts(
  quantity: Quantity,
  value: number | null | undefined,
  system: UnitSystem
): { figure: string; unit: string } | null {
  if (value === null || value === undefined) return null;
  const spec = SPECS[quantity][system];
  return {
    figure: figure(spec.convert(value), spec.places),
    unit: spec.suffix.trim(),
  };
}

/** Both renderings of a measure, for a page that shows one by CSS. */
export function bothUnits(measure: Measure): Record<UnitSystem, string> | null {
  const imperial = formatMeasure(measure, "imperial");
  const metric = formatMeasure(measure, "metric");
  return imperial === null || metric === null ? null : { imperial, metric };
}

export const isUnitSystem = (value: unknown): value is UnitSystem =>
  value === "imperial" || value === "metric";
