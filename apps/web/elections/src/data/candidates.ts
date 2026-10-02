/**
 * Everyone who has stood for the House since 1951, grouped into people.
 * Names in the records vary ("Mitchell, K." / "Keith Mitchell"), so people
 * are matched by surname and first initial, split when full first names
 * differ or races are more than 16 years apart. This is a heuristic and is
 * flagged as such wherever a person's record is shown.
 */
import {
  CODES,
  constituencyName,
  contestStats,
  type ElectionEvent,
  EVENTS,
  slugify,
} from "@/data/model";
import type { ConstituencyCode, ResultsFile, Verification } from "@/data/types";

const PREFIXES = new Set([
  "da",
  "de",
  "la",
  "le",
  "mc",
  "mac",
  "st",
  "st.",
  "van",
  "du",
]);
const TITLE = /^(Dr|Mr|Mrs|Ms|Hon|Sir|Dame)\.?\s+/i;
const DASHES = /[‐‑–]/g;
const SPACES = /\s+/g;
const STARS = /\*/g;
const NOT_LETTERS = /[^a-z]/g;
const NOT_NAME = /[^A-Za-z]/g;
const DOTS = /\./g;

interface ParsedName {
  display: string;
  first: string;
  sur: string;
}

export function parseName(raw: string): ParsedName {
  const n = raw
    .replace(STARS, "")
    .replace(DASHES, "-")
    .replace(SPACES, " ")
    .trim();
  if (n.includes(",")) {
    const [sur = "", rest = ""] = n.split(",");
    return {
      sur: sur.trim(),
      first: rest.trim(),
      display: `${rest.trim()} ${sur.trim()}`,
    };
  }
  const tokens = n.replace(TITLE, "").split(" ");
  let sur = tokens.pop() ?? "";
  const before = tokens.at(-1);
  if (tokens.length > 1 && before && PREFIXES.has(before.toLowerCase()))
    sur = `${tokens.pop()} ${sur}`;
  return { sur, first: tokens.join(" "), display: n.replace(TITLE, "") };
}

function baseKey(p: ParsedName): string {
  const initial = (p.first.replace(NOT_NAME, "")[0] ?? "x").toLowerCase();
  return `${p.sur.toLowerCase().replace(NOT_LETTERS, "")}-${initial}`;
}

export interface Race {
  /** Constituency code on today's boundaries, or null before 1972. */
  code: ConstituencyCode | null;
  constituency: string;
  eventId: string;
  of: number;
  party: string;
  rank: number;
  share: number;
  verification: Verification | undefined;
  votes: number;
  won: boolean;
  year: number;
}

export interface Person {
  bestShare: number;
  first: number;
  /** Stable key, also the URL slug. */
  key: string;
  last: number;
  name: string;
  /** Every spelling seen, newest first. */
  names: string[];
  parties: string[];
  races: Race[];
  wins: number;
}

interface Building {
  full: string | null;
  key: string;
  lastYear: number;
  names: { name: string; official: boolean; year: number }[];
  races: Race[];
}

function racesIn(data: ResultsFile, e: ElectionEvent) {
  if (e.map)
    return CODES.flatMap((code) => {
      const r = data.results[e.id]?.[code];
      return r ? [{ code, constituency: constituencyName(data, code), r }] : [];
    });
  return (data.early[e.id] ?? []).map((r) => ({
    code: null,
    constituency: r.name,
    r,
  }));
}

function personFor(
  people: Map<string, Building>,
  base: string,
  full: string | null,
  year: number
): Building {
  for (let n = 0; ; n++) {
    const key = n ? `${base}-${n}` : base;
    const found = people.get(key);
    if (!found) {
      const fresh: Building = {
        key,
        names: [],
        races: [],
        full: null,
        lastYear: year,
      };
      people.set(key, fresh);
      return fresh;
    }
    const sameName = !(full && found.full) || found.full === full;
    if (sameName && year - found.lastYear <= 16) return found;
  }
}

/** Group every general-election candidacy into people. */
export function buildPeople(data: ResultsFile): Person[] {
  const people = new Map<string, Building>();
  for (const e of EVENTS.filter((x) => x.kind === "general")) {
    for (const { code, constituency, r } of racesIn(data, e)) {
      if (!r.c.length) continue;
      const stats = contestStats(r);
      r.c.forEach((row, i) => {
        const parsed = parseName(row[0]);
        const firstWord = (parsed.first.split(" ")[0] ?? "").replace(DOTS, "");
        const full = firstWord.length > 2 ? firstWord.toLowerCase() : null;
        const person = personFor(people, baseKey(parsed), full, e.year);
        person.full ||= full;
        person.lastYear = e.year;
        person.names.push({
          name: parsed.display,
          year: e.year,
          official: r.src === "peo",
        });
        person.races.push({
          eventId: e.id,
          year: e.year,
          code,
          constituency,
          party: row[1],
          votes: row[2],
          share: row[2] / stats.valid,
          won: i === 0,
          rank: i + 1,
          of: r.c.length,
          verification: row[3],
        });
      });
    }
  }
  return [...people.values()].map((p) => {
    const best = [...p.names].sort(
      (a, b) =>
        Number(b.official) - Number(a.official) || b.name.length - a.name.length
    )[0];
    const years = p.races.map((r) => r.year);
    return {
      key: p.key,
      name: best?.name ?? p.key,
      names: [...new Set([...p.names].reverse().map((n) => n.name))],
      races: p.races,
      wins: p.races.filter((r) => r.won).length,
      first: Math.min(...years),
      last: Math.max(...years),
      parties: [...new Set(p.races.map((r) => r.party))],
      bestShare: Math.max(...p.races.map((r) => r.share)),
    };
  });
}

/**
 * Match a 2026 candidate to a past record by the same surname + initial rule,
 * only if that person stood in 2008 or later. Name matches are flagged ✱.
 */
export function findPerson(people: Person[], name: string): Person | undefined {
  const base = baseKey(parseName(name));
  const matches = people.filter(
    (p) => (p.key === base || p.key.startsWith(`${base}-`)) && p.last >= 2008
  );
  return matches.sort((a, b) => b.last - a.last)[0];
}

/** URL for a person's record. */
export function personHref(person: Pick<Person, "key">): string {
  return `/candidates/${slugify(person.key)}`;
}
