/** Longest hazard text FastAPI accepts (`max_length` on the `hazard` parameter). */
export const HAZARD_MAX_LENGTH = 255;
/** Longest period FastAPI accepts, in days from `start` to `end` (about ten years). */
export const PERIOD_MAX_DAYS = 3660;
export const PERIOD_TOO_LONG = "Choose a period of about ten years or less.";
const MILLISECONDS_PER_DAY = 86_400_000;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export interface StatisticsFilter {
  /** Last day, `YYYY-MM-DD`; null lets the API choose today. */
  end: string | null;
  /** Exact CAP event text; null means every hazard. */
  hazard: string | null;
  /** First day, `YYYY-MM-DD`; null lets the API choose twelve months back. */
  start: string | null;
}

export type StatisticsQuery =
  | ({ ok: true } & StatisticsFilter)
  | { ok: false; problems: string[] };

type Params = Record<string, string | string[] | undefined>;

/** `null` for a repeated parameter, which is refused rather than guessed at. */
function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return null;
  return typeof value === "string" ? value.trim() : "";
}

/** A real calendar day (no 31 February), not just something that looks like one. */
export function isCalendarDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Whole days since 1970-01-01 for a `YYYY-MM-DD` day (UTC, no time zone shift). */
function dayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.round(date.getTime() / MILLISECONDS_PER_DAY);
}

function readDay(
  params: Params,
  name: "end" | "start",
  label: string,
  problems: string[]
): string | null {
  const raw = single(params[name]);
  if (raw === null) {
    problems.push(`The ${label} date must be given once.`);
    return null;
  }
  if (raw === "") return null;
  if (!isCalendarDay(raw)) {
    problems.push(`The ${label} date must be a real day, as YYYY-MM-DD.`);
    return null;
  }
  return raw;
}

/**
 * Reads `start`, `end` and `hazard` from the URL. Only checked values reach
 * FastAPI or the CSV link; a malformed or repeated one is refused with a plain
 * reason, never silently dropped.
 */
export function parseStatisticsQuery(params: Params): StatisticsQuery {
  const problems: string[] = [];
  const start = readDay(params, "start", "start", problems);
  const end = readDay(params, "end", "end", problems);
  if (start && end && start > end) {
    problems.push("The start date must not be after the end date.");
  } else if (
    start &&
    end &&
    dayNumber(end) - dayNumber(start) > PERIOD_MAX_DAYS
  ) {
    problems.push(PERIOD_TOO_LONG);
  }
  const rawHazard = single(params.hazard);
  let hazard: string | null = null;
  if (rawHazard === null) {
    problems.push("The hazard must be given once.");
  } else if (rawHazard !== "") {
    if (
      rawHazard.length > HAZARD_MAX_LENGTH ||
      CONTROL_CHARACTERS.test(rawHazard)
    ) {
      problems.push(
        `The hazard must be plain text of ${HAZARD_MAX_LENGTH} characters or fewer.`
      );
    } else {
      hazard = rawHazard;
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { end, hazard, ok: true, start };
}

/**
 * The filter exactly as typed, for the form to show again when the URL is
 * refused. Nothing is checked here and nothing is sent anywhere; a repeated
 * parameter shows its first value.
 */
export function rawStatisticsFilter(params: Params): StatisticsFilter {
  const first = (value: string | string[] | undefined): string | null => {
    const single = Array.isArray(value) ? value[0] : value;
    return single ?? null;
  };
  return {
    end: first(params.end),
    hazard: first(params.hazard),
    start: first(params.start),
  };
}

/** `?start=…&end=…&hazard=…` with only the filters that are set (empty string if none). */
export function statisticsQueryString(filter: StatisticsFilter): string {
  const query = new URLSearchParams();
  if (filter.start) query.set("start", filter.start);
  if (filter.end) query.set("end", filter.end);
  if (filter.hazard) query.set("hazard", filter.hazard);
  const text = query.toString();
  return text ? `?${text}` : "";
}
