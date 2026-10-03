/**
 * Each party's record at every general election, from the results data only.
 */
import { type Data, eventNational } from "@/data/events";
import { CODES, EVENTS } from "@/data/model";

export interface PartyYear {
  candidates: number;
  /** Total seats contested that year (15 from 1972). */
  races: number;
  seats: number;
  share: number;
  votes: number;
  year: number;
}

export interface PartyRecord {
  code: string;
  years: PartyYear[];
}

/** Candidates a party ran at a general election. */
function candidatesFor(
  data: Data,
  id: string,
  map: boolean,
  party: string
): number {
  const contests = map
    ? CODES.map((c) => data.results.results[id]?.[c]).filter(
        (r) => r !== undefined
      )
    : (data.results.early[id] ?? []);
  return contests.reduce(
    (n, r) => n + r.c.filter((row) => row[1] === party).length,
    0
  );
}

/** Every party that has stood at a general election, with its record by year. */
export function partyRecords(data: Data): PartyRecord[] {
  const records = new Map<string, PartyYear[]>();
  for (const e of EVENTS.filter((x) => x.kind === "general")) {
    const n = eventNational(data, e.id);
    for (const [party, votes] of Object.entries(n.votes)) {
      const years = records.get(party) ?? [];
      years.push({
        year: e.year,
        votes,
        share: votes / n.total,
        seats: n.seats[party] ?? 0,
        races: n.races,
        candidates: candidatesFor(data, e.id, e.map, party),
      });
      records.set(party, years);
    }
  }
  return [...records.entries()].map(([code, years]) => ({ code, years }));
}

export function partySlug(code: string): string {
  return code.toLowerCase();
}
