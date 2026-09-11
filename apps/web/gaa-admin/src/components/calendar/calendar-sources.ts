import type {
  CalendarEventPublic,
  PublicHolidayPublic,
  RosterCalendarEntry,
} from "@barrelsgd/api-client";

/**
 * The three sources the department calendar draws on, mapped to FullCalendar
 * events.
 *
 * The calendar is the department's own record — meetings, training,
 * inspections, visits, deadlines, anything staff put on it. The duty roster is
 * one layer read onto it, not the calendar itself, and public holidays are a
 * third. All three are mapped here, pure and free of React, so the awkward
 * cases can be tested directly: shifts that cross midnight, codes with no clock
 * time, and draft rosters that are not yet the signed plan of record.
 */

/** Which layers the viewer has selected. */
export type CalendarView =
  | "department"
  | "mine"
  | "events"
  | "leave"
  | "holidays";

export const CALENDAR_VIEWS: { value: CalendarView; label: string }[] = [
  { value: "department", label: "Department" },
  { value: "mine", label: "My schedule" },
  { value: "events", label: "Events only" },
  { value: "leave", label: "Leave & absence" },
  { value: "holidays", label: "Public holidays" },
];

/** The roster layer is skipped on views that show no rostered days. */
export function needsRoster(view: CalendarView): boolean {
  return view !== "holidays" && view !== "events";
}

/** The department's own entries show on every view but the roster-free ones. */
export function needsEvents(view: CalendarView): boolean {
  return view === "department" || view === "mine" || view === "events";
}

/** "My schedule" asks only for my shifts; every other view is department-wide. */
export function rosterScope(view: CalendarView): "me" | "department" {
  return view === "mine" ? "me" : "department";
}

export interface CalendarEvent {
  allDay: boolean;
  color: string;
  display?: "background";
  end?: string;
  extendedProps: {
    kind: "event" | "shift" | "holiday";
    eventId?: string;
    code?: string;
    isDraft?: boolean;
    isCancelled?: boolean;
    person?: string;
    location?: string | null;
  };
  id: string;
  start: string;
  title: string;
}

/* -------------------------------------------------------------------------
 * Layer 1 — the department's own entries
 * ---------------------------------------------------------------------- */

/** Colours for the department's entries, by what kind of thing they are. */
const EVENT_KIND_COLOR: Record<string, string> = {
  MEETING: "var(--gm-blue)",
  TRAINING: "var(--gm-sky)",
  INSPECTION: "var(--gm-risk-amber)",
  VISIT: "var(--gm-lime)",
  MAINTENANCE: "var(--gm-risk-grey)",
  OBSERVANCE: "var(--gm-risk-green)",
  DEADLINE: "var(--gm-risk-red)",
  OTHER: "var(--gm-navy)",
};

export function eventColor(event: CalendarEventPublic): string {
  if (event.is_cancelled) return "var(--gm-risk-grey)";
  return EVENT_KIND_COLOR[event.kind] ?? "var(--gm-navy)";
}

/**
 * Times arrive as local wall-clock ISO strings without an offset, the same
 * frame as the roster, so an all-day entry drops the time part and a timed one
 * is handed to FullCalendar as-is. Cancelled entries are marked rather than
 * hidden — the calendar records what was planned as well as what happened.
 */
export function toEventLayer(events: CalendarEventPublic[]): CalendarEvent[] {
  return events.map((event) => ({
    id: `event-${event.id}`,
    title: event.is_cancelled ? `${event.title} (cancelled)` : event.title,
    start: event.all_day
      ? event.starts_at_local.slice(0, 10)
      : event.starts_at_local,
    end: event.all_day ? undefined : event.ends_at_local,
    allDay: event.all_day,
    color: eventColor(event),
    extendedProps: {
      kind: "event" as const,
      eventId: event.id,
      isCancelled: event.is_cancelled,
      location: event.location,
    },
  }));
}

/* -------------------------------------------------------------------------
 * Layer 2 — the duty roster
 * ---------------------------------------------------------------------- */

/**
 * Shift colours, keyed by code and falling back to category.
 *
 * Only existing `--gm-*` tokens: the four work shifts run sky -> blue -> lime ->
 * navy across the day, leave is the risk green/amber pair, and off-duty is the
 * neutral grey. No new design tokens, no hardcoded colour values.
 */
const CODE_COLOR: Record<string, string> = {
  M: "var(--gm-sky)",
  D: "var(--gm-blue)",
  E: "var(--gm-lime)",
  N: "var(--gm-navy)",
  O: "var(--gm-risk-grey)",
  V: "var(--gm-risk-green)",
  S: "var(--gm-risk-amber)",
  L: "var(--gm-risk-amber)",
};

const CATEGORY_COLOR: Record<string, string> = {
  WORK: "var(--gm-blue)",
  OFF: "var(--gm-risk-grey)",
  LEAVE: "var(--gm-risk-green)",
  HOLIDAY: "var(--gm-risk-red)",
};

export function shiftColor(entry: RosterCalendarEntry): string {
  return (
    CODE_COLOR[entry.shift_code] ??
    CATEGORY_COLOR[entry.category] ??
    "var(--gm-blue)"
  );
}

/** True when this rostered day belongs on the selected view. */
function matchesView(entry: RosterCalendarEntry, view: CalendarView): boolean {
  if (view === "leave") return entry.category === "LEAVE";
  // Off-duty days would swamp a month view without adding information; the
  // duty roster grid is where a full O/M/E/N pattern is read.
  return entry.category !== "OFF";
}

/**
 * One event per rostered day.
 *
 * `starts_at_local`/`ends_at_local` are local wall-clock ISO strings with no
 * offset, which FullCalendar reads as local time — the 22:30 night shift
 * therefore renders on its own evening and runs into the following morning,
 * because the API already resolved the end date. Codes with no clock time
 * become all-day events on the assignment date.
 */
export function toRosterLayer(
  entries: RosterCalendarEntry[],
  view: CalendarView,
  options: { showPerson: boolean }
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const entry of entries) {
    if (!matchesView(entry, view)) continue;
    const person = entry.display_name;
    const title = options.showPerson
      ? `${person} · ${entry.label}`
      : entry.label;
    events.push({
      id: `shift-${entry.user_id}-${entry.assignment_date}`,
      title: entry.is_draft ? `${title} (draft)` : title,
      start: entry.starts_at_local ?? entry.assignment_date,
      end: entry.ends_at_local ?? undefined,
      allDay: entry.all_day,
      color: shiftColor(entry),
      extendedProps: {
        kind: "shift",
        code: entry.shift_code,
        isDraft: entry.is_draft,
        person,
      },
    });
  }
  return events;
}

/* -------------------------------------------------------------------------
 * Layer 3 — public holidays
 * ---------------------------------------------------------------------- */

/** Public holidays render behind the day rather than as another chip. */
export function toHolidayLayer(
  holidays: PublicHolidayPublic[]
): CalendarEvent[] {
  return holidays.map((holiday) => ({
    id: `holiday-${holiday.id}`,
    title: holiday.name,
    start: holiday.holiday_date,
    allDay: true,
    color: "var(--gm-risk-red)",
    display: "background" as const,
    extendedProps: { kind: "holiday" as const },
  }));
}
