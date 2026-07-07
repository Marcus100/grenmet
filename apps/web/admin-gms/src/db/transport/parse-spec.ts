/**
 * Pure parser for the staff-transportation timetable seed CSV
 * (apps/web/admin-gms/seed/transport-routes.csv).
 *
 * Kept dependency-free and side-effect-free so it can be unit-tested with Vitest
 * and imported by the Node seed runner (scripts/seed-transport.mjs). It does NOT
 * touch the database — it normalises rows into deduplicated entities keyed for the
 * seed runner to resolve into foreign keys.
 *
 * CSV columns: kind,route,route_name,shift,direction,day_type,depart,arrive,group_time,stop
 *   - `trip` rows open a journey (route/shift/direction/day_type + depart/arrive).
 *   - `stop` rows append, in document order, to the most recently opened trip.
 */

export type Direction = "inbound" | "outbound";
export type DayType = "daily" | "sun_hol" | "mon_sat";

/** Fixed shift catalogue from the memo — operating windows, not per-trip data. */
export const SHIFTS = [
  {
    slug: "morning",
    name: "Morning",
    startTime: "05:30",
    endTime: "14:00",
    sortOrder: 0,
  },
  {
    slug: "afternoon",
    name: "Afternoon",
    startTime: "14:00",
    endTime: "22:30",
    sortOrder: 1,
  },
  {
    slug: "night",
    name: "Night",
    startTime: "22:30",
    endTime: "06:00",
    sortOrder: 2,
  },
  {
    slug: "non_shift",
    name: "Non-Shift",
    startTime: "08:00",
    endTime: "16:00",
    sortOrder: 3,
  },
] as const;

const SHIFT_SLUGS = new Set<string>(SHIFTS.map((s) => s.slug));
const DIRECTIONS = new Set<Direction>(["inbound", "outbound"]);
const DAY_TYPES = new Set<DayType>(["daily", "sun_hol", "mon_sat"]);

export interface ParsedRoute {
  name: string;
  number: number;
  sortOrder: number;
}
export interface ParsedStop {
  name: string;
  slug: string;
  sortOrder: number;
}
export interface ParsedTrip {
  arriveTime: string | null;
  dayType: DayType;
  departTime: string;
  direction: Direction;
  key: string;
  routeNumber: number;
  shiftSlug: string;
  sortOrder: number;
}
export interface ParsedTripStop {
  groupTime: string | null;
  sortOrder: number;
  stopSlug: string;
  tripKey: string;
}

export interface ParsedSpec {
  routes: ParsedRoute[];
  stops: ParsedStop[];
  tripStops: ParsedTripStop[];
  trips: ParsedTrip[];
}

const EXPECTED_HEADER = [
  "kind",
  "route",
  "route_name",
  "shift",
  "direction",
  "day_type",
  "depart",
  "arrive",
  "group_time",
  "stop",
];

const TIME_REGEX = /^(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?|noon)?\.?$/;

/**
 * Parse a wall-clock time like "3:30 a.m.", "12:00 noon" or "10:30 p.m." into a
 * canonical 24-hour "HH:MM" string. Tolerant of dotted/spaced meridiems.
 */
export function parseTime(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const match = TIME_REGEX.exec(cleaned);
  if (!match) {
    throw new Error(`Invalid time: "${raw}"`);
  }
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (minute > 59) {
    throw new Error(`Invalid minutes in time: "${raw}"`);
  }
  const meridiem = match[3]?.replace(/[.\s]/g, "");
  if (meridiem === "noon") {
    hour = 12;
  } else if (meridiem?.startsWith("p")) {
    if (hour !== 12) {
      hour += 12;
    }
  } else if (meridiem?.startsWith("a") && hour === 12) {
    hour = 0;
  }
  if (hour > 23) {
    throw new Error(`Invalid hour in time: "${raw}"`);
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Human 12-hour label, e.g. "5:30 AM". Accepts "HH:MM" or "HH:MM:SS". */
export function formatTime(value: string): string {
  const [rawHour, minute] = value.split(":");
  let hour = Number.parseInt(rawHour, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) {
    hour = 12;
  }
  return `${hour}:${minute} ${suffix}`;
}

/** Human label for a trip direction. */
export function formatDirection(direction: Direction): string {
  return direction === "inbound" ? "To MBIA" : "From MBIA";
}

/** Human label for a trip's day-type applicability. */
export function formatDayType(dayType: DayType): string {
  switch (dayType) {
    case "daily":
      return "Daily";
    case "sun_hol":
      return "Sundays & public holidays";
    default:
      return "Mon–Sat";
  }
}

/** Lower-case, hyphenated slug used as the dedup key for stops. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface SpecRow {
  arrive: string;
  dayType: string;
  depart: string;
  direction: string;
  groupTime: string;
  kind: string;
  route: string;
  routeName: string;
  shift: string;
  stop: string;
}

/** Minimal RFC-4180 CSV reader (handles quoted fields and escaped quotes). */
function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell !== ""));
}

function toSpecRows(text: string): SpecRow[] {
  const grid = parseCsvGrid(text);
  if (grid.length === 0) {
    throw new Error("Empty transport routes CSV");
  }
  const [header, ...body] = grid;
  const normalizedHeader = header.map((cell) => cell.trim().toLowerCase());
  if (normalizedHeader.join(",") !== EXPECTED_HEADER.join(",")) {
    throw new Error(
      `Unexpected CSV header. Expected: ${EXPECTED_HEADER.join(",")}`
    );
  }
  return body.map((cells) => ({
    kind: (cells[0] ?? "").trim(),
    route: (cells[1] ?? "").trim(),
    routeName: (cells[2] ?? "").trim(),
    shift: (cells[3] ?? "").trim(),
    direction: (cells[4] ?? "").trim(),
    dayType: (cells[5] ?? "").trim(),
    depart: (cells[6] ?? "").trim(),
    arrive: (cells[7] ?? "").trim(),
    groupTime: (cells[8] ?? "").trim(),
    stop: (cells[9] ?? "").trim(),
  }));
}

function tripKeyFor(
  routeNumber: number,
  shiftSlug: string,
  direction: string,
  dayType: string
): string {
  return `${routeNumber}::${shiftSlug}::${direction}::${dayType}`;
}

interface ValidatedTrip {
  arriveTime: string | null;
  dayType: DayType;
  departTime: string;
  direction: Direction;
  routeName: string;
  routeNumber: number;
  shiftSlug: string;
}

/** Validate a `trip` row and normalise its scalar fields (throws on any error). */
function validateTripRow(row: SpecRow): ValidatedTrip {
  const routeNumber = Number.parseInt(row.route, 10);
  if (Number.isNaN(routeNumber)) {
    throw new Error(`Invalid route number: "${row.route}"`);
  }
  if (row.routeName === "") {
    throw new Error(`Missing route_name for route ${routeNumber}`);
  }
  if (!SHIFT_SLUGS.has(row.shift)) {
    throw new Error(`Unknown shift: "${row.shift}"`);
  }
  if (!DIRECTIONS.has(row.direction as Direction)) {
    throw new Error(`Unknown direction: "${row.direction}"`);
  }
  if (!DAY_TYPES.has(row.dayType as DayType)) {
    throw new Error(`Unknown day_type: "${row.dayType}"`);
  }
  return {
    routeNumber,
    routeName: row.routeName,
    shiftSlug: row.shift,
    direction: row.direction as Direction,
    dayType: row.dayType as DayType,
    departTime: parseTime(row.depart),
    arriveTime: row.arrive === "" ? null : parseTime(row.arrive),
  };
}

export function parseSpec(csvText: string): ParsedSpec {
  const rows = toSpecRows(csvText);

  const routes = new Map<number, ParsedRoute>();
  const stops = new Map<string, ParsedStop>();
  const trips = new Map<string, ParsedTrip>();
  const tripStops: ParsedTripStop[] = [];

  let stopSort = 0;
  const tripSortByRoute = new Map<number, number>();
  const stopSortByTrip = new Map<string, number>();
  let currentTripKey: string | null = null;

  const registerRoute = (number: number, name: string): void => {
    if (!routes.has(number)) {
      routes.set(number, { number, name, sortOrder: routes.size });
    }
  };

  const registerStop = (name: string): string => {
    const slug = slugify(name);
    if (!stops.has(slug)) {
      stops.set(slug, { slug, name, sortOrder: stopSort++ });
    }
    return slug;
  };

  for (const row of rows) {
    if (row.kind === "trip") {
      const t = validateTripRow(row);
      registerRoute(t.routeNumber, t.routeName);

      const key = tripKeyFor(
        t.routeNumber,
        t.shiftSlug,
        t.direction,
        t.dayType
      );
      if (trips.has(key)) {
        throw new Error(`Duplicate trip: ${key}`);
      }
      const sortOrder = tripSortByRoute.get(t.routeNumber) ?? 0;
      tripSortByRoute.set(t.routeNumber, sortOrder + 1);
      trips.set(key, {
        key,
        routeNumber: t.routeNumber,
        shiftSlug: t.shiftSlug,
        direction: t.direction,
        dayType: t.dayType,
        departTime: t.departTime,
        arriveTime: t.arriveTime,
        sortOrder,
      });
      currentTripKey = key;
      continue;
    }

    if (row.kind === "stop") {
      if (currentTripKey === null) {
        throw new Error(`Stop "${row.stop}" appears before any trip`);
      }
      if (row.stop === "") {
        throw new Error(`Empty stop name under trip ${currentTripKey}`);
      }
      const stopSlug = registerStop(row.stop);
      const sortOrder = stopSortByTrip.get(currentTripKey) ?? 0;
      stopSortByTrip.set(currentTripKey, sortOrder + 1);
      tripStops.push({
        tripKey: currentTripKey,
        stopSlug,
        groupTime: row.groupTime === "" ? null : parseTime(row.groupTime),
        sortOrder,
      });
      continue;
    }

    throw new Error(`Unknown row kind: "${row.kind}"`);
  }

  return {
    routes: [...routes.values()],
    stops: [...stops.values()],
    trips: [...trips.values()],
    tripStops,
  };
}
