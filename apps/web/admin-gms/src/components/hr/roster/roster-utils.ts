import type {
  RosterAssignmentPublic,
  RosterPeriodPublic,
  ShiftCatalogPublic,
} from "@grenmet/api-client";

/** Preferred cell-cycling order; filtered to codes present in the catalog. */
const PREFERRED_CYCLE = ["M", "E", "N", "D", "O", "V", "S", "L"];

export function isoDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function monthRange(monthDate: Date): { start: string; end: string } {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: isoDate(year, month, 1),
    end: isoDate(year, month, lastDay),
  };
}

/**
 * The period covering the displayed month: prefers an exact month match,
 * falls back to any period overlapping the month.
 */
export function findPeriodForMonth(
  periods: RosterPeriodPublic[],
  monthDate: Date
): RosterPeriodPublic | undefined {
  const { start, end } = monthRange(monthDate);
  const exact = periods.find(
    (p) => p.period_start === start && p.period_end === end
  );
  if (exact) return exact;
  return periods.find((p) => p.period_start <= end && p.period_end >= start);
}

export function cellKey(userId: string, date: string): string {
  return `${userId}|${date}`;
}

/** "Gerad" + "Tamar" → "G. Tamar", matching the printed roster convention. */
export function initialName(firstName: string, lastName: string): string {
  const initial = firstName.trim().charAt(0).toUpperCase();
  return initial ? `${initial}. ${lastName}` : lastName;
}

export function buildCycleCodes(catalog: ShiftCatalogPublic[]): string[] {
  const active = new Set(catalog.filter((s) => s.is_active).map((s) => s.code));
  const preferred = PREFERRED_CYCLE.filter((code) => active.has(code));
  const extras = [...active].filter((code) => !PREFERRED_CYCLE.includes(code));
  return [...preferred, ...extras.sort()];
}

export function nextCode(codes: string[], current: string): string {
  if (codes.length === 0) return current;
  const idx = codes.indexOf(current);
  return codes[(idx + 1) % codes.length];
}

/** "05:30" / "14:00" → "0530–1400 hrs", matching the printed legend. */
export function legendLabel(shift: ShiftCatalogPublic): string {
  if (shift.start_time && shift.end_time) {
    const compact = (t: string) => t.replace(":", "");
    return `${compact(shift.start_time)}–${compact(shift.end_time)} hrs`;
  }
  return shift.label;
}

export function buildAssignmentMap(
  assignments: RosterAssignmentPublic[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const assignment of assignments) {
    map[cellKey(assignment.user_id, assignment.assignment_date)] =
      assignment.shift_code;
  }
  return map;
}
