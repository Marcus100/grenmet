/**
 * Totals counted from the PEO's consolidated voter lists and quarterly
 * addenda. Counts only: no individual's details are kept or shown.
 */

export interface RegisterSnapshot {
  date: string;
  /** division → [electors, male, female] */
  div: Record<string, [number, number, number]>;
  file: string;
}

export interface RegisterAddendum {
  date: string;
  /** division → new registrations */
  div: Record<string, number>;
  file: string;
}

export interface RegisterFile {
  addenda: RegisterAddendum[];
  note: string;
  snapshots: RegisterSnapshot[];
  /** [job title, electors] across all lists, most common first. */
  topOccupations: [string, number][];
}

const byDate = <T extends { date: string }>(xs: T[]) =>
  [...xs].sort((a, b) => a.date.localeCompare(b.date));

export function snapshotTotals(file: RegisterFile) {
  return byDate(file.snapshots).map((s) => {
    const rows = Object.values(s.div);
    return {
      date: s.date,
      file: s.file,
      electors: rows.reduce((a, r) => a + r[0], 0),
      male: rows.reduce((a, r) => a + r[1], 0),
      female: rows.reduce((a, r) => a + r[2], 0),
    };
  });
}

export function addendumTotals(file: RegisterFile) {
  return byDate(file.addenda).map((a) => ({
    date: a.date,
    file: a.file,
    added: Object.values(a.div).reduce((x, y) => x + y, 0),
  }));
}

export interface RollCheck {
  added: number;
  from: string;
  /** Previous list + additions − next list: removed or transferred, implied. */
  implied: number;
  next: number;
  previous: number;
  to: string;
}

/** Previous list + new registrations − next list, for each pair of lists. */
export function rollChecks(file: RegisterFile): RollCheck[] {
  const lists = snapshotTotals(file);
  const adds = addendumTotals(file);
  const out: RollCheck[] = [];
  for (let i = 1; i < lists.length; i++) {
    const a = lists[i - 1];
    const b = lists[i];
    if (!(a && b)) continue;
    const added = adds
      .filter((x) => x.date > a.date && x.date <= b.date)
      .reduce((s, x) => s + x.added, 0);
    out.push({
      from: a.date,
      to: b.date,
      previous: a.electors,
      added,
      next: b.electors,
      implied: a.electors + added - b.electors,
    });
  }
  return out;
}

/** Electors per division on the first and last lists. */
export function divisionGrowth(
  file: RegisterFile
): { division: string; first: number; last: number }[] {
  const lists = byDate(file.snapshots);
  const first = lists[0];
  const last = lists.at(-1);
  if (!(first && last)) return [];
  return Object.keys(last.div)
    .sort()
    .map((division) => ({
      division,
      first: first.div[division]?.[0] ?? 0,
      last: last.div[division]?.[0] ?? 0,
    }));
}
