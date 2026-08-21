/**
 * Parsers turning the editor's free-text fields into the structured values the
 * product schema stores.
 *
 * Every field in the forecast editor is a free-text input, so this is where
 * "10–20 mph" becomes a min, a max and a unit. Each parser returns null rather
 * than guessing: an unreadable wind speed must leave the element absent, not
 * silently record a plausible-looking number nobody typed.
 */

import type {
  ElementTemperature,
  ElementTides,
  ElementWind,
  SunMoon,
  TideEvent,
} from "@/db/wxproducts/schema/elements";
import type { CompassDirection } from "@/db/wxproducts/schema/primitives";

const COMPASS: CompassDirection[] = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

// Matches "10-20", "10 – 20", "10 to 20" and a bare "15". En/em dashes appear
// because the values are typed, not selected.
const RANGE = /(\d+)\s*(?:[-–—]|to)\s*(\d+)|(\d+)/;
const KNOTS = /\b(kt|kts|knot|knots)\b/i;
const TIME_12H = /(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i;
const TIME_24H = /^(\d{1,2}):(\d{2})$/;
const NON_COMPASS = /[^A-Z]+/;
const NUMBER = /(-?\d+(?:\.\d+)?)/;
const DOTS = /\./g;

/** Parses "10–20 mph" or "15 kt" into a wind element. */
export function parseWind(
  speed: string,
  direction: string
): ElementWind | null {
  const range = RANGE.exec(speed);
  if (!range) {
    return null;
  }
  const min = Number(range[1] ?? range[3]);
  const max = Number(range[2] ?? range[3]);
  if (!(Number.isFinite(min) && Number.isFinite(max))) {
    return null;
  }

  const directions = parseDirections(direction);
  if (!directions) {
    return null;
  }

  return {
    direction_max: directions.max,
    direction_min: directions.min,
    speed_max: Math.max(min, max),
    speed_min: Math.min(min, max),
    speed_unit: KNOTS.test(speed) ? "kt" : "mph",
  };
}

/** Parses "NE to E", "E-SE" or a single "E" into a direction range. */
export function parseDirections(
  value: string
): { max: CompassDirection; min: CompassDirection } | null {
  const tokens = value
    .toUpperCase()
    .split(NON_COMPASS)
    .filter((t): t is CompassDirection =>
      COMPASS.includes(t as CompassDirection)
    );
  if (tokens.length === 0) {
    return null;
  }
  return { max: tokens.at(-1) as CompassDirection, min: tokens[0] };
}

/** Parses "31", "31°C" or "31 C" into a number of degrees Celsius. */
export function parseCelsius(value: string): number | null {
  const match = NUMBER.exec(value);
  if (!match) {
    return null;
  }
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** Parses "5:42 a.m." or "18:25" into the schema's HH:MM local time. */
export function parseLocalTime(value: string): string | null {
  const trimmed = value.trim();
  const iso = TIME_24H.exec(trimmed);
  if (iso) {
    const h = Number(iso[1]);
    const m = Number(iso[2]);
    return h < 24 && m < 60 ? pad(h, m) : null;
  }

  const match = TIME_12H.exec(trimmed);
  if (!match) {
    return null;
  }
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  const meridiem = match[3]?.toLowerCase().replace(DOTS, "");
  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  return pad(hour, minute);
}

function pad(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function buildTemperature(
  max: string,
  min: string
): ElementTemperature | null {
  const max_c = parseCelsius(max);
  const min_c = parseCelsius(min);
  return max_c === null && min_c === null ? null : { max_c, min_c };
}

export function buildTides(high: string, low: string): ElementTides | null {
  const events: TideEvent[] = [];
  const highTime = parseLocalTime(high);
  const lowTime = parseLocalTime(low);
  if (highTime) {
    events.push({ time_local: highTime, type: "high" });
  }
  if (lowTime) {
    events.push({ time_local: lowTime, type: "low" });
  }
  return events.length > 0 ? { events } : null;
}

export function buildSunMoon(sunrise: string, sunset: string): SunMoon | null {
  const sunrise_local = parseLocalTime(sunrise);
  const sunset_local = parseLocalTime(sunset);
  if (!(sunrise_local || sunset_local)) {
    return null;
  }
  return { sunrise_local, sunset_local };
}
