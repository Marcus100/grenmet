/**
 * Results for any event — general election or referendum — at national,
 * constituency and polling-division level, with the provenance of each
 * figure. Ported from the prototype's results model.
 */
import { CODES, type ElectionEvent, getEvent } from "@/data/model";
import type {
  CandidateRow,
  ConstituencyCode,
  ContestResult,
  ResultsFile,
} from "@/data/types";

interface Ref2016Station {
  div: string;
  no: number;
  reg: number;
  rej: number;
  spoilt?: number;
  sub: string | null;
  voted: number;
  yes: number;
}

interface Ref2018Station {
  div: string;
  no: number;
  place?: string;
  reg: number;
  rej: number;
  sub: string | null;
  voted: number;
  yes: number;
}

export interface ReferendumFile {
  "2016": {
    /** [bill, yes, no, rejected] */
    bills: [string, number, number, number][];
    billsSource: string;
    date: string;
    note: string;
    police: Partial<Record<ConstituencyCode, { reg: number; voted: number }>>;
    registered: number;
    stations: Partial<Record<ConstituencyCode, Ref2016Station[]>>;
    title: string;
    totalsSource: string;
    turnout: number;
    voted: number;
  };
  "2018": {
    complete: ConstituencyCode[];
    date: string;
    invalid: number;
    missingDivisions: Partial<Record<ConstituencyCode, string[]>>;
    no: number;
    note: string;
    registered: number;
    source: string;
    stations: Partial<Record<ConstituencyCode, Ref2018Station[]>>;
    title: string;
    voted: number;
    yes: number;
  };
}

export interface Data {
  referendum: ReferendumFile;
  results: ResultsFile;
}

/** A contest result for any event; referendum rows are Yes/No. */
export interface EventResult extends ContestResult {
  /** Referendum 2016: each voter voted on seven bills, so cast counts people. */
  ballots?: boolean;
}

function referendumResult(
  rows: { reg: number; voted: number; rej: number; yes: number; no: number }[],
  extra: { reg: number; voted: number } | undefined,
  src: string,
  ballots: boolean
): EventResult {
  const sum = (k: "reg" | "voted" | "rej" | "yes" | "no") =>
    rows.reduce((a, r) => a + (r[k] || 0), 0);
  const c: CandidateRow[] = [
    ["Yes", "YES", sum("yes")],
    ["No", "NO", sum("no")],
  ];
  c.sort((a, b) => b[2] - a[2]);
  return {
    reg: sum("reg") + (extra?.reg ?? 0),
    cast: sum("voted") + (extra?.voted ?? 0),
    rej: sum("rej"),
    c,
    src,
    ballots,
  };
}

/** One constituency's result in an event, or null if none can be read. */
export function eventResult(
  data: Data,
  id: string,
  code: ConstituencyCode
): EventResult | null {
  const e = getEvent(id);
  if (!e) return null;
  if (e.kind === "general") return data.results.results[e.id]?.[code] ?? null;
  if (e.id === "2016r") {
    const r = data.referendum["2016"];
    const stations = r.stations[code] ?? [];
    if (!stations.length) return null;
    return referendumResult(stations, r.police[code], "peo-ref", true);
  }
  const r = data.referendum["2018"];
  // The Gazette page is damaged for constituencies not in `complete`.
  if (!r.complete.includes(code)) return null;
  return referendumResult(r.stations[code] ?? [], undefined, "gazette", false);
}

export type TurnoutSource =
  | "peo"
  | "peo-valid"
  | "gazette-valid"
  | "newsletter"
  | "wikipedia"
  | "none"
  | "certificate";

export interface NationalEvent {
  bills?: [string, number, number, number][];
  cast: number;
  /** Constituencies with no readable result (2018 referendum). */
  missing?: ConstituencyCode[];
  /** Number of constituencies (early elections had different boundaries). */
  races: number;
  registered: number | null;
  rejected: number;
  seats: Record<string, number>;
  total: number;
  turnout: number | null;
  turnoutSource: TurnoutSource;
  votes: Record<string, number>;
}

function tally(rows: (ContestResult | null)[]) {
  const seats: Record<string, number> = {};
  const votes: Record<string, number> = {};
  let registered = 0;
  let cast = 0;
  let rejected = 0;
  let registeredKnown = true;
  let races = 0;
  for (const x of rows) {
    const winner = x?.c[0];
    if (!(x && winner)) continue;
    races++;
    seats[winner[1]] = (seats[winner[1]] ?? 0) + 1;
    for (const [, p, v] of x.c) votes[p] = (votes[p] ?? 0) + v;
    if (x.reg) registered += x.reg;
    else registeredKnown = false;
    cast += x.cast ?? 0;
    rejected += x.rej ?? 0;
  }
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  return {
    seats,
    votes,
    total,
    registered,
    registeredKnown,
    cast,
    rejected,
    races,
  };
}

function referendumNational(data: Data, id: "2016r" | "2018r"): NationalEvent {
  const t = tally(CODES.map((c) => eventResult(data, id, c)));
  if (id === "2018r") {
    const r = data.referendum["2018"];
    return {
      seats: t.seats,
      votes: { YES: r.yes, NO: r.no },
      total: r.yes + r.no,
      registered: r.registered,
      cast: r.voted,
      rejected: r.invalid,
      turnout: r.voted / r.registered,
      turnoutSource: "certificate",
      races: t.races,
      missing: CODES.filter((c) => !r.complete.includes(c)),
    };
  }
  const r = data.referendum["2016"];
  return {
    seats: t.seats,
    votes: { YES: t.votes.YES ?? 0, NO: t.votes.NO ?? 0 },
    total: (t.votes.YES ?? 0) + (t.votes.NO ?? 0),
    registered: r.registered,
    cast: r.voted ?? t.cast,
    rejected: t.rejected,
    turnout: r.turnout,
    turnoutSource: "certificate",
    races: t.races,
    bills: r.bills,
  };
}

/** Registration and turnout for a mapped general election, by what each year's record allows. */
function mappedTurnout(
  year: number,
  t: ReturnType<typeof tally>
): Pick<NationalEvent, "registered" | "turnout" | "turnoutSource"> {
  const ratio = t.registered ? t.cast / t.registered : null;
  if (year === 1972 || year === 1976)
    return {
      registered: t.registered,
      turnout: ratio,
      turnoutSource: "gazette-valid",
    };
  if (year === 1990)
    return {
      registered: t.registered,
      turnout: ratio,
      turnoutSource: "newsletter",
    };
  const known = t.registeredKnown && t.registered > 0;
  if (year < 2013)
    return {
      registered: known ? t.registered : null,
      turnout: known ? ratio : null,
      turnoutSource: known ? "peo-valid" : "none",
    };
  return {
    registered: known ? t.registered : null,
    turnout: known && t.cast ? ratio : null,
    turnoutSource: "peo",
  };
}

/** National seats, votes and turnout for an event, with turnout's provenance. */
export function eventNational(data: Data, id: string): NationalEvent {
  const e = getEvent(id) as ElectionEvent;
  if (e.id === "2016r" || e.id === "2018r")
    return referendumNational(data, e.id);
  if (!e.map) {
    const recorded = data.results.national[e.id];
    const t = tally(data.results.early[e.id] ?? []);
    return {
      seats: t.seats,
      votes: t.votes,
      total: t.total,
      registered: recorded?.registered ?? null,
      cast: t.cast,
      rejected: t.rejected,
      turnout: recorded?.turnout ?? null,
      turnoutSource: "wikipedia",
      races: t.races,
    };
  }
  const t = tally(CODES.map((c) => eventResult(data, id, c)));
  return {
    seats: t.seats,
    votes: t.votes,
    total: t.total,
    cast: t.cast,
    rejected: t.rejected,
    races: t.races,
    ...mappedTurnout(e.year, t),
  };
}

/** Plain-English provenance of a national turnout figure, or "". */
export function turnoutNote(source: TurnoutSource): string {
  switch (source) {
    case "wikipedia":
      return "Turnout from Wikipedia (secondary)";
    case "peo-valid":
      return "Turnout is valid votes ÷ registered voters (PEO); rejected ballots aren’t in the PEO table";
    case "gazette-valid":
      return "Turnout is valid votes ÷ electors on the lists (Gazette); rejected ballots aren’t published";
    case "newsletter":
      return "Electors and votes cast from The Grenada Newsletter (24 March 1990); the PEO document has no usable 1990 registration";
    case "none":
      return "No usable registration figures in the PEO document for this year";
    default:
      return "";
  }
}

/** Whether an event's results come from an official record. */
export function isOfficial(id: string): boolean {
  const e = getEvent(id);
  return !!e && (e.kind === "ref" || e.year >= 1984 || e.year === 1972);
}

const EARLY_GAZETTES: Record<number, string> = {
  1954: "Government Gazette (Extraordinary) No. 54, 30 September 1954",
  1957: "Government Gazette (Extraordinary) No. 53, 5 October 1957",
  1961: "Government Gazette (Extraordinary) No. 18, 6 April 1961",
  1962: "Government Gazette (Extraordinary) Nos. 56 and 63 of 1962",
};

export interface Provenance {
  official: boolean;
  /** Some figures official, some secondary. */
  partial?: boolean;
  text: string;
}

/** Where an event's (or one constituency's) figures come from. */
export function eventSource(
  data: Data,
  id: string,
  code?: ConstituencyCode
): Provenance {
  const e = getEvent(id) as ElectionEvent;
  const r = code ? eventResult(data, id, code) : null;
  if (e.kind === "ref")
    return {
      official: true,
      text:
        e.id === "2016r"
          ? "Parliamentary Elections Office, certificates of the results of the constitutional referendum, 24 November 2016"
          : data.referendum["2018"].source,
    };
  if (e.year >= 2013)
    return {
      official: true,
      text: `Parliamentary Elections Office, ${e.year === 2013 ? "Final Report, Elections 2013" : `General Election Report ${e.year}`}${r?.page ? `, p. ${r.page}` : ""}`,
    };
  if (e.year === 1990)
    return {
      official: true,
      text: "Winners: Government Gazette No. 15, 16 March 1990 (Supervisor of Elections’ declaration). Other candidates, electors and votes cast: The Grenada Newsletter, 24 March 1990, marked †",
    };
  if (e.year >= 1984)
    return {
      official: true,
      text: `Parliamentary Elections Office, Old Elections Results (general elections 1984–2008)${r?.page ? `, PDF p. ${r.page}` : ""}, candidate table`,
    };
  if (e.year === 1976)
    return {
      official: false,
      partial: true,
      text: "Votes: The Grenada Newsletter, 11 December 1976, reporting the Supervisor of Elections’ figures (marked †). Electors: Government Gazette (Extraordinary) No. 58, 30 November 1976",
    };
  if (e.year === 1972)
    return {
      official: true,
      text: `Government Gazette No. 20, 11 March 1972${r?.page ? `, p. ${r.page}` : ", pp. 132–137"}, results by polling division published by the Supervisor of Elections`,
    };
  const gazette = EARLY_GAZETTES[e.year];
  if (gazette)
    return {
      official: false,
      partial: true,
      text: `Winners’ votes checked against the ${gazette}. Other candidates’ votes are from ElectionPassport (secondary) and are marked ✱`,
    };
  return {
    official: false,
    text: "ElectionPassport compilation (secondary, citing Midgett 1983 and PEO records). No official record for this election has been found yet",
  };
}

export interface StationRow {
  cast: number | null;
  place: string;
  reg: number | null;
  rej: number | null;
  sub: string | null;
  votes: Record<string, number>;
}

export interface EventDivision {
  /** Rows most votes first: [name, party, votes]. */
  c: CandidateRow[];
  cast: number;
  code: ConstituencyCode;
  division: string;
  places: string[];
  registered: number;
  rejected: number;
  stations: StationRow[];
}

/** Place names by division from the general-election station lists, for referendum stations without one. */
function placeByDivision(data: Data): Record<string, string> {
  const out: Record<string, string> = {};
  for (const year of ["2013", "2018", "2022"])
    for (const rows of Object.values(data.results.stations[year] ?? {}))
      for (const row of rows ?? []) if (row[2]) out[row[0]] = row[2];
  return out;
}

type Accumulator = EventDivision & {
  names: Record<string, string>;
  votes: Record<string, number>;
};

function addStation(d: Accumulator, station: StationRow): void {
  if (station.place && !d.places.includes(station.place))
    d.places.push(station.place);
  d.registered += station.reg ?? 0;
  d.cast += station.cast ?? 0;
  d.rejected += station.rej ?? 0;
  for (const [p, v] of Object.entries(station.votes))
    d.votes[p] = (d.votes[p] ?? 0) + v;
  d.stations.push(station);
}

/** Station rows for one constituency in an event, with their division. */
function stationsFor(
  data: Data,
  e: ElectionEvent,
  code: ConstituencyCode,
  places: Record<string, string>
): { division: string; station: StationRow }[] {
  if (e.kind === "general")
    return (data.results.stations[e.id]?.[code] ?? []).map(
      ([division, sub, place, reg, cast, rej, votes]) => ({
        division,
        station: { sub, place, reg, cast, rej, votes },
      })
    );
  const rows =
    e.id === "2016r"
      ? data.referendum["2016"].stations[code]
      : data.referendum["2018"].stations[code];
  return (rows ?? []).map((s) => ({
    division: s.div,
    station: {
      sub: s.sub,
      place: ("place" in s && s.place) || places[s.div] || "",
      reg: s.reg,
      cast: s.voted,
      rej: s.rej,
      votes: { YES: s.yes, NO: s.no },
    },
  }));
}

/** Polling divisions (with their stations) for an event, in one or all constituencies. */
export function eventDivisions(
  data: Data,
  id: string,
  code?: ConstituencyCode
): EventDivision[] {
  const e = getEvent(id);
  if (!e?.divs) return [];
  const places = e.kind === "ref" ? placeByDivision(data) : {};
  const out = new Map<string, Accumulator>();
  for (const c of code ? [code] : CODES) {
    const contest = e.kind === "general" ? eventResult(data, id, c) : null;
    const names: Record<string, string> =
      e.kind === "general"
        ? Object.fromEntries((contest?.c ?? []).map((r) => [r[1], r[0]]))
        : { YES: "Yes", NO: "No" };
    for (const { division, station } of stationsFor(data, e, c, places)) {
      let d = out.get(division);
      if (!d) {
        d = {
          division,
          code: c,
          places: [],
          registered: 0,
          cast: 0,
          rejected: 0,
          stations: [],
          c: [],
          votes: {},
          names,
        };
        out.set(division, d);
      }
      addStation(d, station);
    }
  }
  return [...out.values()]
    .map(({ votes, names, ...d }) => ({
      ...d,
      c: Object.entries(votes)
        .map(([p, v]): CandidateRow => [names[p] ?? p, p, v])
        .sort((a, b) => b[2] - a[2]),
    }))
    .sort((a, b) => a.division.localeCompare(b.division));
}

/** URL slug for an event: "2022", "2016-referendum". */
export function eventSlug(id: string): string {
  return id.endsWith("r") ? `${id.slice(0, -1)}-referendum` : id;
}

/** The event id for a slug, or null. */
export function eventFromSlug(slug: string): string | null {
  const id = slug.endsWith("-referendum") ? `${slug.slice(0, 4)}r` : slug;
  return getEvent(id) ? id : null;
}

/** Notes that qualify one constituency's figures, shown beside them. */
export function resultNotes(result: EventResult, year: number): string[] {
  const notes: string[] = [];
  if (result.derived)
    notes.push(
      "Derived: the report leaves out this constituency’s total and division P06(b). Every figure here is the PEO national summary minus the other 14 constituencies."
    );
  if (result.note) notes.push(result.note);
  if (result.castIsValid)
    notes.push(
      "Turnout here is valid votes ÷ registered voters; the PEO table doesn’t give rejected ballots."
    );
  if (result.src === "peo-old" && !result.reg && year === 1990)
    notes.push("The PEO document has no usable registration figure for 1990.");
  return notes;
}

/** "Yes"/"No" for referendum sides, the party code otherwise. */
export function sideLabel(party: string): string {
  if (party === "YES") return "Yes";
  if (party === "NO") return "No";
  return party;
}

/** Page title for an event. */
export function eventTitle(id: string): string {
  const e = getEvent(id);
  if (!e) return id;
  if (e.id === "2016r") return "Seven constitutional bills";
  if (e.id === "2018r") return "Caribbean Court of Justice";
  return `${e.year} general election`;
}

/** One line summing up an event's outcome. */
export function eventHeadline(data: Data, id: string): string {
  const n = eventNational(data, id);
  if (id === "2016r")
    return `No won all seven bills, by between 13 and 53 points, on a turnout of ${(100 * (n.turnout ?? 0)).toFixed(1)}%.`;
  if (id === "2018r")
    return `${((100 * (n.votes.NO ?? 0)) / n.total).toFixed(1)}% voted to keep the Privy Council as Grenada’s final court of appeal.`;
  const order = Object.entries(n.seats).sort((a, b) => b[1] - a[1]);
  return order.map(([p, k]) => `${p} ${k}`).join(" · ");
}
