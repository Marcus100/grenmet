/**
 * Shapes assembled from the small JSON records in `src/data/source/`.
 * Arrays are kept as tuples to match the checked source records; see README.md.
 */

/** How far a figure can be trusted; drives the ✱ / ✱✱ / † markers. */
export type Verification = "official" | "corroborated" | "unverified" | "check";

/** [name, party code, votes, verification] */
export type CandidateRow = [string, string, number, Verification?];

/** Constituency letter codes as the PEO uses them (no I, O or Q). */
export type ConstituencyCode =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "P"
  | "R";

export interface ContestResult {
  c: CandidateRow[];
  cast: number | null;
  castIsValid?: boolean;
  derived?: boolean;
  gazette?: string;
  note?: string;
  official?: boolean;
  page?: number;
  reg: number | null;
  rej: number | null;
  src: string;
}

/** [division, sub-station, place, registered, cast, rejected, votes by party] */
export type StationRow = [
  string,
  string | null,
  string,
  number | null,
  number | null,
  number | null,
  Record<string, number>,
];

export interface NationalFigure {
  registered: number;
  source: string;
  turnout: number | null;
}

export interface ResultsFile {
  /** code → [full name, short name] */
  cons: Record<ConstituencyCode, [string, string]>;
  early: Record<string, (ContestResult & { name: string })[]>;
  national: Record<string, NationalFigure>;
  results: Record<string, Partial<Record<ConstituencyCode, ContestResult>>>;
  stations: Record<string, Partial<Record<ConstituencyCode, StationRow[]>>>;
}

export type SourceRef = [label: string, url: string];

export interface CampaignEvent {
  date: string;
  flag: "unverified" | "check" | null;
  future?: boolean;
  note?: string;
  src: string;
  text: string;
}

export interface Poll {
  field: string;
  flag: "unverified" | "check" | null;
  id: string;
  NDC: number | null;
  NNP: number | null;
  n: number | null;
  note?: string;
  pollster: string;
  pub: string | null;
  seats?: Record<string, number>;
  src: string;
  target: string;
}

export interface CampaignFile {
  announce: string;
  candidate_flags: {
    NDC: string;
    NNP: Partial<Record<ConstituencyCode, string>>;
  };
  /** Why a named candidate is uncertain (✱), by party and seat. */
  candidate_seat_flags?: Record<
    string,
    Partial<Record<ConstituencyCode, string>>
  >;
  /** Source id for candidates named later, by party and seat. */
  candidate_seat_sources?: Record<
    string,
    Partial<Record<ConstituencyCode, string>>
  >;
  /** Source id for each party's slate as first published. */
  candidate_sources: Record<string, string | null>;
  candidates: Record<string, Partial<Record<ConstituencyCode, string>>>;
  deadline: string;
  /** When Parliament was dissolved, once it has been. */
  dissolved?: string | null;
  events: CampaignEvent[];
  /** Nomination day, once proclaimed in the Gazette. */
  nomination_day?: string | null;
  police_polling_day?: string | null;
  /** Polling day, once proclaimed in the Gazette. */
  polling_day?: string | null;
  polls: Poll[];
  sitting: Partial<
    Record<
      ConstituencyCode,
      { name: string; party: string; src: string; was: string }
    >
  >;
  sources: Record<string, SourceRef>;
  updated: string;
  /** When the Governor-General issued the writs, once gazetted. */
  writs?: string | null;
}

/** A ring of [x, y] points in map units (y up). */
export type Ring = [number, number][];

export interface GeoFile {
  constituencies: Record<
    ConstituencyCode,
    { label: [number, number]; rings: Ring[] }
  >;
  divisions: Record<
    string,
    {
      cons: ConstituencyCode;
      label: [number, number];
      located: boolean;
      rings: Ring[];
      villages: string[];
    }
  >;
  /** The box where Carriacou & Petite Martinique are drawn closer than they are. */
  inset: { x0: number; x1: number; y0: number; y1: number };
  land: Ring[];
}
