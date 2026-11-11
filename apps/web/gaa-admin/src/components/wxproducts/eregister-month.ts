// The month workbook: a register month laid out like the CL1 hourly sheet, one
// row per local hour. Pure helpers here; the screen is eregister-month-view.tsx.

import type { RegisterObservationRead } from "@barrelsgd/api-client";
import { FIELD_LABELS, REGISTER_FIELDS, TIME_MARKS } from "./eregister-layout";

/** Grenada is UTC-4 all year (no daylight saving). */
const LOCAL_OFFSET_HOURS = 4;
const HOUR_MS = 3_600_000;
const HOURS_PER_DAY = 24;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/u;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const HAS_ZONE = /[zZ]|[+-]\d{2}:?\d{2}$/u;
/** A cell starting with these runs as a formula in Excel. */
const FORMULA_START = /^[=+\-@\t\r]/u;
/** A plain number such as -5 or -12.3 is data, not a formula. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/u;
const NEEDS_QUOTES = /[",\n\r]/u;

/** Must match IMPORT_NOTE_PREFIX in apps/api/fastapi/src/eregister/cl1_import.py. */
export const IMPORT_NOTE_PREFIX = "Imported from the hourly sheet";

export type Observation = RegisterObservationRead;
export type RowState = Observation["state"];
export type Source = "keyed" | "imported";

export interface WorkbookColumn {
  /** Short heading, the WMO code ("dd", "VV"); empty for time marks. */
  code: string;
  /** Stored keys behind the cell, joined in order ("YY" + "GG"). */
  keys: readonly string[];
  label: string;
}

const LAYER_KEY = /layer(\d)_/u;

/** The four cloud layers share paper labels; name each by its layer. */
function withLayer(label: string, key: string): string {
  const layer = LAYER_KEY.exec(key)?.[1];
  return layer ? `${label}, layer ${layer}` : label;
}

/**
 * One column per stored reading, in register order. A signed value shown as
 * two cells on the keying form is one column here; an upper entry (Gust over
 * Wind Speed) gets its own column.
 */
export const WORKBOOK_COLUMNS: readonly WorkbookColumn[] = [
  ...REGISTER_FIELDS.filter((column) => column.signed?.role !== "sign").flatMap(
    (column): WorkbookColumn[] => [
      ...(column.upper
        ? [
            {
              code: column.upper.code,
              keys: [column.upper.key],
              label: column.upper.label,
            },
          ]
        : []),
      {
        code: column.code,
        keys: column.parts ? column.parts.keys : [column.key],
        label: withLayer(column.label, column.key),
      },
    ]
  ),
  ...TIME_MARKS.map((mark) => ({
    code: "",
    keys: [mark.key],
    label: FIELD_LABELS[mark.key] ?? mark.label,
  })),
];

export interface MonthRange {
  days: string[];
  /** Inclusive, UTC ISO: local midnight on the 1st. */
  from: string;
  /** Exclusive, UTC ISO: local midnight on the 1st of the next month. */
  to: string;
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH.test(value);
}

export function isDay(value: unknown, month?: string): value is string {
  if (typeof value !== "string") return false;
  const match = DAY.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value)) {
    return false;
  }
  return month === undefined || value.startsWith(`${month}-`);
}

/** The local month containing `now` ("2026-11"). */
export function currentMonth(now: Date = new Date()): string {
  return new Date(now.getTime() - LOCAL_OFFSET_HOURS * HOUR_MS)
    .toISOString()
    .slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Not a month: ${month}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + by));
  return date.toISOString().slice(0, 7);
}

export function monthRange(month: string): MonthRange {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Not a month: ${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  const from = new Date(Date.UTC(year, index, 1, LOCAL_OFFSET_HOURS));
  const to = new Date(Date.UTC(year, index + 1, 1, LOCAL_OFFSET_HOURS));
  const count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const days = Array.from(
    { length: count },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`
  );
  return { days, from: from.toISOString(), to: to.toISOString() };
}

/** Local calendar day and hour of a UTC observation time. */
export function localSlot(observedAt: string): { day: string; hour: number } {
  const stamp = HAS_ZONE.test(observedAt) ? observedAt : `${observedAt}Z`;
  const local = new Date(
    new Date(stamp).getTime() - LOCAL_OFFSET_HOURS * HOUR_MS
  );
  return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

/** UTC time label for a local day and hour ("16:00"). */
export function utcHourLabel(hour: number): string {
  return `${String((hour + LOCAL_OFFSET_HOURS) % HOURS_PER_DAY).padStart(2, "0")}:00`;
}

export function bodyText(observation: Observation, key: string): string {
  const value = (observation.body as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function sourceOf(observation: Observation): Source {
  return bodyText(observation, "notes").startsWith(IMPORT_NOTE_PREFIX)
    ? "imported"
    : "keyed";
}

export function sourceText(observation: Observation): string {
  return sourceOf(observation) === "imported" ? "Imported" : "Keyed";
}

export function cellText(observation: Observation, column: WorkbookColumn) {
  return column.keys.map((key) => bodyText(observation, key)).join("");
}

export type Severity = "error" | "warning";

/** The worst finding per stored key; findings without a field go under "". */
export function problemsByKey(observation: Observation): Map<string, Severity> {
  const found = new Map<string, Severity>();
  for (const issue of observation.issues ?? []) {
    const severity: Severity = issue.severity === "error" ? "error" : "warning";
    const key = issue.field ?? "";
    if (found.get(key) !== "error") found.set(key, severity);
  }
  return found;
}

/** Each distinct message once, errors first. */
export function problemMessages(observation: Observation): string[] {
  const issues = [...(observation.issues ?? [])].sort(
    (a, b) => Number(b.severity === "error") - Number(a.severity === "error")
  );
  return [...new Set(issues.map((issue) => issue.message))];
}

export interface HourRow {
  day: string;
  hour: number;
  /** The live record for this hour; undefined when nothing was recorded. */
  observation?: Observation;
  /** No live record, but one was recorded and rejected. */
  rejected?: boolean;
}

const HIDDEN_STATES = new Set<RowState>(["superseded", "rejected"]);

/**
 * Every hour of every day in the month. A superseded or rejected record never
 * fills an hour; if an hour somehow holds two live records the newest wins.
 */
export function monthRows(
  month: string,
  observations: readonly Observation[]
): HourRow[] {
  const { days } = monthRange(month);
  const byHour = new Map<string, Observation>();
  const rejected = new Set<string>();
  for (const observation of observations) {
    if (!observation.observed_at) continue;
    const { day, hour } = localSlot(observation.observed_at);
    const slot = `${day} ${hour}`;
    if (HIDDEN_STATES.has(observation.state)) {
      if (observation.state === "rejected") rejected.add(slot);
      continue;
    }
    const held = byHour.get(slot);
    if (!held || (held.updated_at ?? "") < (observation.updated_at ?? "")) {
      byHour.set(slot, observation);
    }
  }
  return days.flatMap((day) =>
    Array.from({ length: HOURS_PER_DAY }, (_, hour): HourRow => {
      const slot = `${day} ${hour}`;
      const observation = byHour.get(slot);
      return observation
        ? { day, hour, observation }
        : { day, hour, rejected: rejected.has(slot) };
    })
  );
}

/** What an hour without a live record says. */
export function emptyHourText(row: HourRow): string {
  return row.rejected ? "Rejected, not replaced" : "Not recorded";
}

/** Per day: hours with a live record, and whether any has a problem. */
export function dayStatus(
  rows: readonly HourRow[]
): Map<string, { flagged: boolean; recorded: number }> {
  const status = new Map<string, { flagged: boolean; recorded: number }>();
  for (const { day, observation } of rows) {
    const current = status.get(day) ?? { flagged: false, recorded: 0 };
    if (observation) {
      current.recorded += 1;
      if ((observation.issues ?? []).length > 0) current.flagged = true;
    }
    status.set(day, current);
  }
  return status;
}

export type StateFilter = "all" | "draft" | "accepted" | "historical";
export type SourceFilter = "all" | Source;

export interface Filters {
  problemsOnly: boolean;
  search: string;
  source: SourceFilter;
  state: StateFilter;
}

export const NO_FILTERS: Filters = {
  problemsOnly: false,
  search: "",
  source: "all",
  state: "all",
};

export function isFiltered(filters: Filters): boolean {
  return (
    filters.state !== "all" ||
    filters.source !== "all" ||
    filters.problemsOnly ||
    filters.search.trim() !== ""
  );
}

function stateGroup(state: RowState): StateFilter {
  if (state === "draft" || state === "qc_pending") return "draft";
  if (state === "accepted" || state === "historical") return state;
  return "all";
}

/**
 * Whether a row passes the filters. Empty hours show only while nothing is
 * filtered, so the unfiltered month always has every hour.
 */
export function rowMatches(row: HourRow, filters: Filters): boolean {
  const { observation } = row;
  if (!observation) return !isFiltered(filters);
  if (
    filters.state !== "all" &&
    stateGroup(observation.state) !== filters.state
  ) {
    return false;
  }
  if (filters.source !== "all" && sourceOf(observation) !== filters.source) {
    return false;
  }
  if (filters.problemsOnly && (observation.issues ?? []).length === 0) {
    return false;
  }
  const needle = filters.search.trim().toLowerCase();
  if (needle) {
    const haystack = [
      observation.coded ?? "",
      observation.raw_tac ?? "",
      observation.actor_name ?? "",
      observation.review_note ?? "",
      bodyText(observation, "notes"),
      ...problemMessages(observation),
    ]
      .join("\n")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export interface MonthCounts {
  accepted: number;
  draft: number;
  historical: number;
  missing: number;
  recorded: number;
  /** Hours whose only records were rejected (not counted as missing). */
  rejected: number;
  reviewed: number;
  withProblems: number;
}

export function monthCounts(rows: readonly HourRow[]): MonthCounts {
  const counts: MonthCounts = {
    accepted: 0,
    draft: 0,
    historical: 0,
    missing: 0,
    recorded: 0,
    rejected: 0,
    reviewed: 0,
    withProblems: 0,
  };
  for (const { observation, rejected } of rows) {
    if (!observation) {
      if (rejected) counts.rejected += 1;
      else counts.missing += 1;
      continue;
    }
    counts.recorded += 1;
    const group = stateGroup(observation.state);
    if (group === "draft" || group === "accepted" || group === "historical") {
      counts[group] += 1;
    }
    if ((observation.issues ?? []).length > 0) counts.withProblems += 1;
    if (observation.review_outcome) counts.reviewed += 1;
  }
  return counts;
}

export type WorkbookSearch = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Month, day and filters from the page URL; anything invalid falls back. */
export function parseWorkbookSearch(search: WorkbookSearch): {
  month: string;
  day?: string;
  filters: Filters;
} {
  const monthValue = one(search.month);
  const month = isMonth(monthValue) ? monthValue : currentMonth();
  const dayValue = one(search.day);
  const state = one(search.state);
  const source = one(search.source);
  return {
    day: isDay(dayValue, month) ? dayValue : undefined,
    filters: {
      problemsOnly: one(search.problems) === "1",
      search: (one(search.q) ?? NO_FILTERS.search).slice(0, 100),
      source:
        source === "keyed" || source === "imported"
          ? source
          : NO_FILTERS.source,
      state:
        state === "draft" || state === "accepted" || state === "historical"
          ? state
          : NO_FILTERS.state,
    },
    month,
  };
}

const STATE_TEXT: Record<RowState, string> = {
  accepted: "Accepted",
  draft: "Awaiting acceptance",
  historical: "Historical",
  qc_pending: "Awaiting acceptance",
  rejected: "Rejected",
  superseded: "Superseded",
};

export function stateText(state: RowState): string {
  return STATE_TEXT[state];
}

export function reviewText(observation: Observation): string {
  if (observation.review_outcome === "reviewed") return "Reviewed";
  if (observation.review_outcome === "query") return "Query";
  return "";
}

/** "Wind Direction (dd)", or the label alone when there is no code. */
export function columnTitle(column: WorkbookColumn): string {
  return column.code ? `${column.label} (${column.code})` : column.label;
}

function csvCell(value: string): string {
  // Leading = + - @ would run as a formula in Excel; prefix a quote.
  const safe =
    FORMULA_START.test(value) && !PLAIN_NUMBER.test(value)
      ? `'${value}`
      : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The rows as CSV, one line per hour, with a header row. */
export function monthCsv(rows: readonly HourRow[]): string {
  const header = [
    "Date (local)",
    "Hour (local)",
    "UTC",
    "State",
    "Source",
    "Review",
    ...WORKBOOK_COLUMNS.map((column) => columnTitle(column)),
    "Problems",
  ];
  const lines = rows.map((row) => {
    const { day, hour, observation } = row;
    return [
      day,
      `${String(hour).padStart(2, "0")}:00`,
      utcHourLabel(hour),
      observation ? stateText(observation.state) : emptyHourText(row),
      observation ? sourceText(observation) : "",
      observation ? reviewText(observation) : "",
      ...WORKBOOK_COLUMNS.map((column) =>
        observation ? cellText(observation, column) : ""
      ),
      observation ? problemMessages(observation).join(" | ") : "",
    ];
  });
  // Excel reads UTF-8 CSV correctly only with a byte order mark.
  const BOM = "\uFEFF";
  return `${BOM}${[header, ...lines]
    .map((line) => line.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}
