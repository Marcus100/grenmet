/**
 * Validation, query building and display helpers for the audit log screen.
 * Pure functions, unit-tested without a server. FastAPI owns the log, the
 * keyset cursor and the masking; this file only shapes what is asked for and
 * how a row is shown. Nothing here ever unmasks a value.
 */

import { parseDay } from "@/lib/payment-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ORGANISATION_ID = /^[A-Za-z0-9_-]{1,100}$/u;
const WORD = /^[a-z0-9_.-]+$/u;
const MAX_ACTION = 20;
const MAX_ENTITY_TYPE = 60;
const MAX_CURSOR = 500;

/** Grenada is UTC-4 all year (no daylight saving), so a Grenada day starts at 04:00 UTC. */
const GRENADA_DAY_START_UTC_HOUR = 4;
const GRENADA_TIME_ZONE = "America/Grenada";

export type AuditHref = "/audit" | `/audit?${string}`;

/** The filter values as the staff typed them, after validation. Days are Grenada dates. */
export interface AuditFilters {
  action?: string;
  actorId?: string;
  entityType?: string;
  from?: string;
  organisationId?: string;
  to?: string;
}

type Values = Record<string, string | undefined>;

function field(values: Values, key: string): string {
  return (values[key] ?? "").trim();
}

export type AuditFilterParse =
  | { ok: true; value: AuditFilters }
  | { ok: false; problems: string[] };

/** Problems with the text filters (actor, action, entity type, organisation). */
function textProblems(values: Values): string[] {
  const problems: string[] = [];
  const actorId = field(values, "actor_id");
  const action = field(values, "action");
  const entityType = field(values, "entity_type");
  const organisationId = field(values, "organisation_id");
  if (actorId && !UUID.test(actorId)) {
    problems.push("The actor id must be a full user id (a UUID).");
  }
  if (action && (action.length > MAX_ACTION || !WORD.test(action))) {
    problems.push(
      "The action must be a short word such as create or update, up to 20 characters."
    );
  }
  if (
    entityType &&
    (entityType.length > MAX_ENTITY_TYPE || !WORD.test(entityType))
  ) {
    problems.push(
      "The entity type must be a short name such as platform_organisation, up to 60 characters."
    );
  }
  if (organisationId && !ORGANISATION_ID.test(organisationId)) {
    problems.push(
      "The organisation id may use letters, numbers, hyphens and underscores only."
    );
  }
  return problems;
}

function parseDayOrUndefined(value: string): string | undefined {
  return value ? parseDay(value) : undefined;
}

/** Problems with the from and to dates: each must be a real day, and from is not after to. */
function dayProblems(from: string, to: string): string[] {
  const problems: string[] = [];
  const fromDay = parseDayOrUndefined(from);
  const toDay = parseDayOrUndefined(to);
  if (from && !fromDay) {
    problems.push("The from date must be a real day in the form YYYY-MM-DD.");
  }
  if (to && !toDay) {
    problems.push("The to date must be a real day in the form YYYY-MM-DD.");
  }
  if (fromDay && toDay && toDay < fromDay) {
    problems.push("The to date is before the from date.");
  }
  return problems;
}

/**
 * Reads the GET form. Empty fields are no filter. Any invalid field stops the
 * list from loading: a silently dropped filter would show the wrong entries.
 */
export function parseAuditFilters(values: Values): AuditFilterParse {
  const problems = [
    ...textProblems(values),
    ...dayProblems(field(values, "from"), field(values, "to")),
  ];
  if (problems.length > 0) return { ok: false, problems };

  const fromDay = parseDayOrUndefined(field(values, "from"));
  const toDay = parseDayOrUndefined(field(values, "to"));
  const actorId = field(values, "actor_id");
  const action = field(values, "action");
  const entityType = field(values, "entity_type");
  const organisationId = field(values, "organisation_id");
  return {
    ok: true,
    value: {
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(organisationId ? { organisationId } : {}),
      ...(fromDay ? { from: fromDay } : {}),
      ...(toDay ? { to: toDay } : {}),
    },
  };
}

/** Start of a Grenada day as a UTC instant the API accepts (ends in Z). */
export function grenadaDayStart(day: string): string {
  const [year = 1970, month = 1, dayOfMonth = 1] = day.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, dayOfMonth, GRENADA_DAY_START_UTC_HOUR)
  ).toISOString();
}

/** Last millisecond of a Grenada day: the API compares created_to inclusively. */
export function grenadaDayEnd(day: string): string {
  const [year = 1970, month = 1, dayOfMonth = 1] = day.split("-").map(Number);
  const nextDayStart = Date.UTC(
    year,
    month - 1,
    dayOfMonth + 1,
    GRENADA_DAY_START_UTC_HOUR
  );
  return new Date(nextDayStart - 1).toISOString();
}

/** The API's opaque cursor, bounded. Anything longer is not a cursor it issued. */
export function parseCursor(value: string | undefined): string | undefined {
  return value && value.length <= MAX_CURSOR ? value : undefined;
}

/** The query for `GET /api/v1/audit/admin/entries` (the API's own parameter names). */
export function auditApiQuery(
  filters: AuditFilters,
  cursor: string | undefined
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.actorId) params.set("actor_id", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entity_type", filters.entityType);
  if (filters.organisationId) {
    params.set("organisation_id", filters.organisationId);
  }
  if (filters.from) params.set("created_from", grenadaDayStart(filters.from));
  if (filters.to) params.set("created_to", grenadaDayEnd(filters.to));
  if (cursor) params.set("cursor", cursor);
  return params;
}

/**
 * A link to this screen with the same filters. The cursor is the API's opaque
 * `next_cursor`, passed through URL encoding; omit it for the newest entries.
 */
export function auditPageHref(
  filters: AuditFilters,
  cursor?: string
): AuditHref {
  const params = new URLSearchParams();
  if (filters.actorId) params.set("actor_id", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entity_type", filters.entityType);
  if (filters.organisationId) {
    params.set("organisation_id", filters.organisationId);
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}

/** Grenada wall-clock time, e.g. "22 Nov 2026, 10:15". */
export function formatGrenada(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GRENADA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** The same instant in UTC, e.g. "2026-11-22 14:15 UTC". */
export function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * A change value exactly as the API sent it. Absent is "-", null is "null";
 * nothing is trimmed, rounded or reformatted.
 */
export function changeValue(
  value: string | number | boolean | null | undefined
): string {
  if (value === undefined) return "-";
  if (value === null) return "null";
  return String(value);
}
