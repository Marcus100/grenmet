/**
 * Everything the Results atlas draws, in one compact payload served as a
 * static file and loaded in the browser.
 */
import {
  type Data,
  eventDivisions,
  eventNational,
  eventResult,
  eventSource,
  isOfficial,
  turnoutNote,
} from "@/data/events";
import { CODES, EVENTS, getEvent, prevGeneral } from "@/data/model";
import type {
  CandidateRow,
  ConstituencyCode,
  GeoFile,
  ResultsFile,
} from "@/data/types";

export interface AtlasContest {
  c: CandidateRow[];
  cast: number | null;
  note?: string;
  reg: number | null;
  rej: number | null;
}

export interface AtlasDivision {
  /** Rows most votes first: [name, party, votes]. */
  c: CandidateRow[];
  cast: number;
  code: ConstituencyCode;
  division: string;
  place: string;
  reg: number;
}

export interface AtlasEvent {
  date: string;
  divisions: AtlasDivision[];
  /** Earlier constituencies retain their names; never assign modern letter codes. */
  historicalResults: (AtlasContest & { name: string; gazette?: string })[];
  id: string;
  kind: "general" | "ref";
  label: string;
  mapped: boolean;
  /** Constituencies with no readable result. */
  missing: ConstituencyCode[];
  national: {
    races: number;
    seats: Record<string, number>;
    total: number;
    turnout: number | null;
    turnoutNote: string;
    votes: Record<string, number>;
    registered: number | null;
    cast: number;
  };
  official: boolean;
  prev: string | null;
  results: Partial<Record<ConstituencyCode, AtlasContest>>;
  source: string;
  year: number;
}

export interface AtlasData {
  events: AtlasEvent[];
  geo: GeoFile;
  names: Record<ConstituencyCode, [string, string]>;
}

/** Serialize results only where modern constituency codes apply. */
function mappedResults(
  data: Data,
  id: string
): Partial<Record<ConstituencyCode, AtlasContest>> {
  const contests: Partial<Record<ConstituencyCode, AtlasContest>> = {};
  for (const code of CODES) {
    const r = eventResult(data, id, code);
    if (r)
      contests[code] = {
        c: r.c,
        reg: r.reg,
        cast: r.cast,
        rej: r.rej,
        ...(r.note ? { note: r.note } : {}),
      };
  }
  return contests;
}

export function buildAtlas(
  data: Data,
  geo: GeoFile,
  results: ResultsFile
): AtlasData {
  const events = EVENTS.map((e): AtlasEvent => {
    const n = eventNational(data, e.id);
    const previous = prevGeneral(e.id);
    const contests = e.map ? mappedResults(data, e.id) : {};
    return {
      id: e.id,
      kind: e.kind,
      year: e.year,
      date: e.date,
      label: e.sub ? `${e.year} ${e.sub.toLowerCase()}` : String(e.year),
      mapped: e.map,
      historicalResults: e.map ? [] : (data.results.early[e.id] ?? []),
      official: isOfficial(e.id),
      source: eventSource(data, e.id).text,
      prev: previous && getEvent(previous)?.map ? previous : null,
      national: {
        races: n.races,
        seats: n.seats,
        votes: n.votes,
        total: n.total,
        turnout: n.turnout,
        turnoutNote: turnoutNote(n.turnoutSource),
        registered: n.registered,
        cast: n.cast,
      },
      results: contests,
      missing: e.map ? CODES.filter((c) => !contests[c]) : [],
      divisions: eventDivisions(data, e.id).map((d) => ({
        division: d.division,
        code: d.code,
        place: d.places[0] ?? "",
        reg: d.registered,
        cast: d.cast,
        c: d.c,
      })),
    };
  });
  return { events, geo, names: results.cons };
}
