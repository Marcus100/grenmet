import type { AstronomyResponse, TidesResponse } from "@barrelsgd/api-client";
import {
  MOON_PHASES,
  type ProductField,
  type ProductValues,
  parameterKey,
  TIDE_SLOTS,
} from "@barrelsgd/gms/products";
import { format, parseISO } from "date-fns";

/**
 * Fill from the almanac and the tide table (issue #1197). Pure functions: the
 * desk fetches the answers and applies the patch. Only empty fields are ever
 * filled; a typed value always wins. Sun and moon times are predicted, and
 * tides are predicted and not for navigation.
 */

/** Shown after a sun and moon fill. */
export const ALMANAC_HINT = "Filled from the almanac (predicted)";
/** Shown after a tide fill; the standing note stays under the Tides fields. */
export const TIDE_HINT =
  "Filled from the tide table (predicted, not for navigation)";
export const TIDE_STANDING_NOTE = "Predicted, not for navigation.";

/** Prickly Bay is the only tide station; the almanac has one location for sun and moon. */
export const ALMANAC_LOCATION = "mbia";
export const TIDE_STATION = "pric";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/u;

type Astronomy = AstronomyResponse;
type AstronomyDay = Astronomy["days"][number];
type TideEvent = TidesResponse["events"][number];

export function addDays(isoDate: string, days: number): string {
  const next = new Date(`${isoDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** "17:45" from a Grenada wall-clock time such as "2026-11-09T17:45:00-04:00". */
export function clockOf(local: string | null | undefined): string | null {
  return LOCAL_DATE_TIME.exec(local ?? "")?.[2] ?? null;
}

function dateOfLocal(local: string | null | undefined): string | null {
  return LOCAL_DATE_TIME.exec(local ?? "")?.[1] ?? null;
}

function readableDate(isoDate: string): string {
  return format(parseISO(isoDate), "d MMM yyyy");
}

/**
 * The calendar day a section's values belong to: the day's own date on an
 * evening forecast, otherwise the product's issue date (its `issuedAt`, Grenada
 * time). Null when a day section has no valid date yet.
 */
export function fillDate(
  values: ProductValues,
  issueDate: string,
  prefix: string
): string | null {
  if (prefix) {
    const day = values[parameterKey(prefix, "date")] ?? "";
    return ISO_DATE.test(day) ? day : null;
  }
  const issued = values.issuedAt?.slice(0, 10) ?? "";
  return ISO_DATE.test(issued) ? issued : issueDate;
}

/** Keys whose current value is blank: the only ones a fill may write. */
export function emptyKeys(
  patch: ProductValues,
  current: (key: string) => string | undefined
): string[] {
  return Object.keys(patch).filter((key) => !(current(key) ?? "").trim());
}

/** The moon phase name as the form lists it ("Waxing Crescent" → "Waxing crescent"). */
function matchMoonPhase(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return MOON_PHASES.find((option) => option.toLowerCase() === wanted) ?? null;
}

interface SunMoonSource {
  /** 0 for the date itself, 1 for the day after. */
  dayOffset: 0 | 1;
  read: (day: AstronomyDay) => string | null;
}

/** Form keys that come from a day row (morning and marine forecasts). */
const SUN_MOON_SOURCES: Record<string, SunMoonSource> = {
  sunsetToday: { dayOffset: 0, read: (d) => clockOf(d.sunset.local) },
  sunriseTomorrow: { dayOffset: 1, read: (d) => clockOf(d.sunrise.local) },
  sunrise: { dayOffset: 0, read: (d) => clockOf(d.sunrise.local) },
  sunset: { dayOffset: 0, read: (d) => clockOf(d.sunset.local) },
  moonrise: { dayOffset: 0, read: (d) => clockOf(d.moonrise.local) },
  moonset: { dayOffset: 0, read: (d) => clockOf(d.moonset.local) },
  moonPhase: { dayOffset: 0, read: (d) => matchMoonPhase(d.moon_phase) },
};

type Resolved =
  | { value: string }
  | { missing: "no-row"; date: string }
  | { missing: "none"; date: string }
  | { missing: "no-phase"; date: string };

function resolveSunMoon(
  key: string,
  date: string,
  astronomy: Astronomy
): Resolved | null {
  if (key === "moonPhaseDate") {
    // The next principal phase on or after the date (accurate to a day).
    const phase = astronomy.phases.find((p) => p.date >= date);
    return phase ? { value: phase.date } : { missing: "no-phase", date };
  }
  const source = SUN_MOON_SOURCES[key];
  if (!source) return null;
  const target = addDays(date, source.dayOffset);
  const day = astronomy.days.find((d) => d.date === target);
  if (!day) return { missing: "no-row", date: target };
  const value = source.read(day);
  return value ? { value } : { missing: "none", date: target };
}

export interface AlmanacFill {
  /** Plain sentences for the desk: missing rows and fields left empty. */
  notes: string[];
  /** Values for the fields the almanac answered. */
  patch: ProductValues;
}

/** Sun, twilight, moon and phase values for a section's fields. */
export function almanacFill({
  date,
  fields,
  astronomy,
}: {
  date: string;
  fields: readonly ProductField[];
  astronomy: Astronomy;
}): AlmanacFill {
  const patch: ProductValues = {};
  const absent = new Map<string, string[]>();
  const notes: string[] = [];
  const addAbsent = (key: string, label: string) =>
    absent.set(key, [...(absent.get(key) ?? []), label]);
  for (const field of fields) {
    const resolved = resolveSunMoon(field.key, date, astronomy);
    if (!resolved) continue;
    if ("value" in resolved) {
      patch[field.key] = resolved.value;
      continue;
    }
    if (resolved.missing === "no-row")
      addAbsent(`row:${resolved.date}`, field.label);
    else if (resolved.missing === "no-phase") addAbsent("phase", field.label);
    else
      notes.push(
        `No ${field.label.toLowerCase()} on ${readableDate(resolved.date)}. Left empty.`
      );
  }
  for (const [key, labels] of absent) {
    if (key === "phase") {
      notes.push(
        `No principal moon phase on or after ${readableDate(date)} in the almanac. Left empty: ${labels.join(", ")}.`
      );
    } else {
      const day = key.slice("row:".length);
      notes.push(
        `No almanac row for ${readableDate(day)}. Left empty: ${labels.join(", ")}.`
      );
    }
  }
  return { patch, notes };
}

export interface TideFill {
  notes: string[];
  /** Tide type, time and height for the slots the fill used. */
  patch: ProductValues;
  /** Highest tide slot used, so the desk can show it. 0 when none. */
  rows: number;
  /** One line per filled tide: "High 14:32, 1.20 m (3.9 ft)". */
  summary: string[];
}

export function tideHeight(metres: number, marine: boolean): string {
  const shown = `${metres.toFixed(2)} m`;
  return marine ? `${shown} (${(metres / 0.3048).toFixed(1)} ft)` : shown;
}

/**
 * Predicted high and low tides for one date, written into the tide slots that
 * are still completely empty, in time order. A slot with any typed value is
 * left alone.
 */
export function tideFill({
  date,
  fields,
  prefix,
  tides,
  marine,
  values,
}: {
  date: string;
  fields: readonly ProductField[];
  prefix: string;
  tides: TidesResponse;
  marine: boolean;
  values: ProductValues;
}): TideFill {
  const present = new Set(fields.map((f) => f.key));
  const keyOf = (slot: number, part: "Type" | "Time" | "Height") =>
    parameterKey(prefix, `tide${slot}${part}`);
  const slotEmpty = (slot: number) =>
    [keyOf(slot, "Type"), keyOf(slot, "Time"), keyOf(slot, "Height")]
      .filter((key) => present.has(key))
      .every((key) => !(values[key] ?? "").trim());
  const freeSlots = TIDE_SLOTS.filter(slotEmpty);
  const events: TideEvent[] = tides.events.filter(
    (event) => dateOfLocal(event.time_local) === date
  );
  const patch: ProductValues = {};
  const summary: string[] = [];
  const notes: string[] = [];
  let rows = 0;
  const used = events.slice(0, freeSlots.length);
  for (const [index, event] of used.entries()) {
    const slot = freeSlots[index] ?? 0;
    const time = clockOf(event.time_local) ?? "";
    const type = event.event_type === "HIGH" ? "High" : "Low";
    const writes: [string, string][] = [
      [keyOf(slot, "Type"), type],
      [keyOf(slot, "Time"), time],
      [keyOf(slot, "Height"), event.height_m_mllw.toFixed(2)],
    ];
    for (const [key, value] of writes) {
      if (present.has(key)) patch[key] = value;
    }
    rows = Math.max(rows, slot);
    summary.push(`${type} ${time}, ${tideHeight(event.height_m_mllw, marine)}`);
  }
  if (events.length === 0)
    notes.push(
      `No tide predictions for ${readableDate(date)} in the table. Tide fields left empty.`
    );
  else if (events.length > freeSlots.length)
    notes.push(
      `${events.length - freeSlots.length} more tide(s) did not fit the empty tide slots.`
    );
  return { patch, rows, summary, notes };
}
