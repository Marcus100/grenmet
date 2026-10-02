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
} from "@/data/events";
import { CODES, EVENTS, prevGeneral } from "@/data/model";
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
  id: string;
  kind: "general" | "ref";
  label: string;
  /** Constituencies with no readable result. */
  missing: ConstituencyCode[];
  national: {
    seats: Record<string, number>;
    total: number;
    turnout: number | null;
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

export function buildAtlas(
  data: Data,
  geo: GeoFile,
  results: ResultsFile
): AtlasData {
  const events = EVENTS.filter((e) => e.map).map((e): AtlasEvent => {
    const n = eventNational(data, e.id);
    const contests: Partial<Record<ConstituencyCode, AtlasContest>> = {};
    for (const code of CODES) {
      const r = eventResult(data, e.id, code);
      if (r)
        contests[code] = {
          c: r.c,
          reg: r.reg,
          cast: r.cast,
          rej: r.rej,
          ...(r.note ? { note: r.note } : {}),
        };
    }
    return {
      id: e.id,
      kind: e.kind,
      year: e.year,
      date: e.date,
      label: e.sub ? `${e.year} ${e.sub.toLowerCase()}` : String(e.year),
      official: isOfficial(e.id),
      source: eventSource(data, e.id).text,
      prev: prevGeneral(e.id),
      national: {
        seats: n.seats,
        votes: n.votes,
        total: n.total,
        turnout: n.turnout,
        registered: n.registered,
        cast: n.cast,
      },
      results: contests,
      missing: CODES.filter((c) => !contests[c]),
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
