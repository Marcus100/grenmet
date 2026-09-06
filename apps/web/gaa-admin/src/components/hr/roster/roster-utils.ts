import type {
  DepartmentMemberPublic,
  RosterAssignmentPublic,
  RosterPeriodPublic,
  ShiftCatalogPublic,
} from "@barrelsgd/api-client";

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

/** A grade band and the members holding it, in the order the roster prints. */
export interface MemberGroup {
  key: string;
  label: string | null;
  members: DepartmentMemberPublic[];
}

/**
 * Split department members into the grade bands the printed roster separates
 * with blank rows. The API already returns members ordered by grade rank, so
 * this only has to break the run whenever the grade changes. Members with no
 * grade recorded fall into one trailing unlabelled group rather than vanishing.
 */
export function groupByGrade(members: DepartmentMemberPublic[]): MemberGroup[] {
  const groups: MemberGroup[] = [];
  for (const member of members) {
    const key = member.grade?.code ?? "";
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.members.push(member);
      continue;
    }
    groups.push({
      key,
      label: member.grade?.label ?? null,
      members: [member],
    });
  }
  return groups;
}

/**
 * Flag every cell belonging to a run of two or more identical work shifts, so
 * the grid can underline a run's extent without merging cells or hiding a day.
 *
 * Only work shifts are marked. Off duty stays quiet, and leave carries a
 * highlight band of its own, so underlining those would double up. A blank cell
 * never joins a run — an unrostered gap is not a stretch of anything.
 */
export function markShiftRuns(
  codes: string[],
  workCodes: ReadonlySet<string>
): boolean[] {
  const marks: boolean[] = new Array(codes.length).fill(false);
  let start = 0;
  while (start < codes.length) {
    const code = codes[start];
    let end = start;
    while (end + 1 < codes.length && codes[end + 1] === code) {
      end += 1;
    }
    if (code && workCodes.has(code) && end > start) {
      for (let i = start; i <= end; i += 1) {
        marks[i] = true;
      }
    }
    start = end + 1;
  }
  return marks;
}

/** Codes the catalog classifies as work, for run marking. */
export function workShiftCodes(
  catalog: ShiftCatalogPublic[]
): ReadonlySet<string> {
  return new Set(
    catalog.filter((s) => s.category === "WORK").map((s) => s.code)
  );
}
