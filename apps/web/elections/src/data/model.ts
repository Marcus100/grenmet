import type {
  CandidateRow,
  ConstituencyCode,
  ContestResult,
  ResultsFile,
} from "@/data/types";

/** The 15 constituencies in PEO letter order. */
export const CODES: readonly ConstituencyCode[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "R",
];

export const SEATS = 15;
export const MAJORITY = 8;

const DATES: Record<number, string> = {
  1951: "10 October 1951",
  1954: "20 September 1954",
  1957: "24 September 1957",
  1961: "27 March 1961",
  1962: "13 September 1962",
  1967: "24 August 1967",
  1972: "28 February 1972",
  1976: "7 December 1976",
  1984: "3 December 1984",
  1990: "13 March 1990",
  1995: "20 June 1995",
  1999: "18 January 1999",
  2003: "27 November 2003",
  2008: "8 July 2008",
  2013: "19 February 2013",
  2018: "13 March 2018",
  2022: "23 June 2022",
};

/** Elections before 1972 used different boundaries, so they aren't mapped. */
export const EARLY_YEARS = [1951, 1954, 1957, 1961, 1962, 1967] as const;
/** Elections drawn on today's 15 constituencies. */
export const MAPPED_YEARS = [
  1972, 1976, 1984, 1990, 1995, 1999, 2003, 2008, 2013, 2018, 2022,
] as const;
/** Elections with published polling-division results. */
export const DIVISION_YEARS = [2013, 2018, 2022] as const;

export interface ElectionEvent {
  date: string;
  divs: boolean;
  id: string;
  kind: "general" | "ref";
  label: string;
  map: boolean;
  sub?: string;
  year: number;
}

function order(e: ElectionEvent): number {
  if (e.kind === "ref") return e.year + (e.id === "2018r" ? 0.9 : 0.8);
  return e.year + (e.year === 2018 ? 0.2 : 0);
}

/** Every general election and referendum, oldest first. */
export const EVENTS: readonly ElectionEvent[] = [
  ...EARLY_YEARS.map((year) => ({
    id: String(year),
    kind: "general" as const,
    year,
    date: DATES[year] ?? String(year),
    map: false,
    divs: false,
    label: String(year),
  })),
  ...MAPPED_YEARS.map((year) => ({
    id: String(year),
    kind: "general" as const,
    year,
    date: DATES[year] ?? String(year),
    map: true,
    divs: (DIVISION_YEARS as readonly number[]).includes(year),
    label: String(year),
  })),
  {
    id: "2016r",
    kind: "ref" as const,
    year: 2016,
    date: "24 November 2016",
    map: true,
    divs: true,
    label: "2016",
    sub: "Referendum",
  },
  {
    id: "2018r",
    kind: "ref" as const,
    year: 2018,
    date: "6 November 2018",
    map: true,
    divs: true,
    label: "2018",
    sub: "Referendum",
  },
].sort((a, b) => order(a) - order(b));

export function getEvent(id: string): ElectionEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}

/** The mapped general election before this one, for swing and gains. */
export function prevGeneral(id: string): string | null {
  const e = getEvent(id);
  if (e?.kind !== "general") return null;
  const i = (MAPPED_YEARS as readonly number[]).indexOf(e.year);
  return i > 0 ? String(MAPPED_YEARS[i - 1]) : null;
}

export function constituencyName(
  data: ResultsFile,
  code: ConstituencyCode
): string {
  return data.cons[code][0];
}

export function constituencyShortName(
  data: ResultsFile,
  code: ConstituencyCode
): string {
  return data.cons[code][1];
}

/** A constituency's result in a general election, or null if none is known. */
export function generalResult(
  data: ResultsFile,
  year: string,
  code: ConstituencyCode
): ContestResult | null {
  return data.results[year]?.[code] ?? null;
}

export interface ContestStats {
  /** Votes of the winner minus the runner-up. */
  majority: number;
  /** Majority as a share of valid votes. */
  margin: number;
  runnerUp: CandidateRow | undefined;
  share: (party: string) => number;
  turnout: number | null;
  /** First party's share of the two-party vote, or null if neither stood. */
  twoParty: number | null;
  twoPartyPair: [string, string];
  valid: number;
  winner: CandidateRow;
}

/** Margins, shares and turnout for a contest. Rows must be sorted by votes. */
export function contestStats(
  contest: Pick<ContestResult, "c" | "cast" | "reg">
): ContestStats {
  const valid = contest.c.reduce((sum, row) => sum + row[2], 0) || 1;
  const [winner, runnerUp] = contest.c as [CandidateRow, ...CandidateRow[]];
  const share = (party: string) =>
    contest.c
      .filter((row) => row[1] === party)
      .reduce((sum, row) => sum + row[2], 0) / valid;
  const pair: [string, string] = contest.c.some((row) => row[1] === "YES")
    ? ["YES", "NO"]
    : ["NDC", "NNP"];
  const a = share(pair[0]);
  const b = share(pair[1]);
  const majority = winner[2] - (runnerUp?.[2] ?? 0);
  return {
    valid,
    winner,
    runnerUp,
    share,
    majority,
    margin: majority / valid,
    turnout: contest.reg && contest.cast ? contest.cast / contest.reg : null,
    twoParty: a + b > 0 ? a / (a + b) : null,
    twoPartyPair: pair,
  };
}

export interface NationalResult {
  cast: number;
  registered: number | null;
  rejected: number;
  seats: Record<string, number>;
  /** Valid votes across all parties. */
  total: number;
  turnout: number | null;
  votes: Record<string, number>;
}

/** Seats and votes nationally for a mapped general election. */
export function nationalResult(
  data: ResultsFile,
  year: string
): NationalResult {
  const seats: Record<string, number> = {};
  const votes: Record<string, number> = {};
  let registered = 0;
  let cast = 0;
  let rejected = 0;
  let registeredKnown = true;
  for (const code of CODES) {
    const contest = generalResult(data, year, code);
    if (!contest?.c[0]) continue;
    const winner = contest.c[0][1];
    seats[winner] = (seats[winner] ?? 0) + 1;
    for (const [, party, v] of contest.c)
      votes[party] = (votes[party] ?? 0) + v;
    if (contest.reg) registered += contest.reg;
    else registeredKnown = false;
    cast += contest.cast ?? 0;
    rejected += contest.rej ?? 0;
  }
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const reg = registeredKnown ? registered : null;
  return {
    seats,
    votes,
    total,
    registered: reg,
    cast,
    rejected,
    turnout: reg && cast ? cast / reg : null,
  };
}

/** National NDC share of the NDC–NNP vote, over seats where both stood. */
export function nationalTwoParty(
  data: ResultsFile,
  year: string
): number | null {
  let ndc = 0;
  let nnp = 0;
  for (const code of CODES) {
    const contest = generalResult(data, year, code);
    if (!contest) continue;
    const votesFor = (party: string) =>
      contest.c
        .filter((row) => row[1] === party)
        .reduce((sum, row) => sum + row[2], 0);
    const a = votesFor("NDC");
    const b = votesFor("NNP");
    if (a > 0 && b > 0) {
      ndc += a;
      nnp += b;
    }
  }
  return ndc + nnp ? ndc / (ndc + nnp) : null;
}

/** NDC share of the NDC–NNP vote in one seat, or null if either didn't stand. */
export function seatTwoParty(
  data: ResultsFile,
  year: string,
  code: ConstituencyCode
): number | null {
  const contest = generalResult(data, year, code);
  if (!contest) return null;
  const votesFor = (party: string) =>
    contest.c
      .filter((row) => row[1] === party)
      .reduce((sum, row) => sum + row[2], 0);
  const a = votesFor("NDC");
  const b = votesFor("NNP");
  return a > 0 && b > 0 ? a / (a + b) : null;
}

/** Weights of the Grenada Lean Index: recent elections count for more. */
export const LEAN_WEIGHTS = { 2022: 0.75, 2018: 0.25 } as const;

/**
 * How a seat leans against the country: its NDC two-party share minus the
 * national one, averaged over 2022 (75%) and 2018 (25%). Positive leans NDC.
 */
export function seatLean(
  data: ResultsFile,
  code: ConstituencyCode
): number | null {
  let lean = 0;
  for (const [year, weight] of Object.entries(LEAN_WEIGHTS)) {
    const seat = seatTwoParty(data, year, code);
    const nation = nationalTwoParty(data, year);
    if (seat == null || nation == null) return null;
    lean += weight * (seat - nation);
  }
  return lean;
}

/** "NDC+7", "NNP+3" or "EVEN" (within half a point). */
export function leanLabel(lean: number): string {
  if (Math.abs(lean) < 0.005) return "EVEN";
  return `${lean > 0 ? "NDC" : "NNP"}+${Math.round(Math.abs(lean) * 100)}`;
}

export interface PollScore {
  /** Election result: NDC share of the NDC–NNP vote. */
  actual: number;
  /** Poll − result; positive means the poll overstated the NDC. */
  error: number;
  /** Poll's NDC share of the NDC–NNP vote. */
  estimate: number;
}

const YEAR = /^\d{4}$/;

/** A published poll against the election it preceded, or null if it can't be scored. */
export function pollScore(
  data: ResultsFile,
  poll: { NDC: number | null; NNP: number | null; target: string }
): PollScore | null {
  if (poll.NDC == null || poll.NNP == null || !YEAR.test(poll.target))
    return null;
  const actual = nationalTwoParty(data, poll.target);
  if (actual == null) return null;
  const estimate = poll.NDC / (poll.NDC + poll.NNP);
  return { estimate, actual, error: estimate - actual };
}

export interface SeatYear {
  margin: number;
  runnerUp?: { name: string; party: string };
  turnout: number | null;
  winner: { name: string; party: string; votes: number };
  year: string;
}

/** Who won a seat at each mapped general election, oldest first. */
export function seatHistory(
  data: ResultsFile,
  code: ConstituencyCode
): SeatYear[] {
  return MAPPED_YEARS.flatMap((y) => {
    const year = String(y);
    const contest = generalResult(data, year, code);
    if (!contest?.c[0]) return [];
    const s = contestStats(contest);
    return [
      {
        year,
        winner: { name: s.winner[0], party: s.winner[1], votes: s.winner[2] },
        ...(s.runnerUp
          ? { runnerUp: { name: s.runnerUp[0], party: s.runnerUp[1] } }
          : {}),
        margin: s.margin,
        turnout: s.turnout,
      },
    ];
  });
}

export interface DivisionResult {
  /** Candidate rows, most votes first: [name, party, votes]. */
  c: CandidateRow[];
  cast: number;
  division: string;
  places: string[];
  registered: number;
}

/** Polling-division totals for one seat, from the station returns. */
export function divisionResults(
  data: ResultsFile,
  year: string,
  code: ConstituencyCode
): DivisionResult[] {
  const contest = generalResult(data, year, code);
  const names = Object.fromEntries((contest?.c ?? []).map((r) => [r[1], r[0]]));
  const out = new Map<
    string,
    {
      cast: number;
      places: string[];
      registered: number;
      votes: Record<string, number>;
    }
  >();
  for (const [division, , place, reg, cast, , votes] of data.stations[year]?.[
    code
  ] ?? []) {
    const d = out.get(division) ?? {
      cast: 0,
      places: [],
      registered: 0,
      votes: {},
    };
    if (place && !d.places.includes(place)) d.places.push(place);
    d.registered += reg ?? 0;
    d.cast += cast ?? 0;
    for (const [party, v] of Object.entries(votes))
      d.votes[party] = (d.votes[party] ?? 0) + v;
    out.set(division, d);
  }
  return [...out.entries()]
    .map(([division, d]) => ({
      division,
      places: d.places,
      registered: d.registered,
      cast: d.cast,
      c: Object.entries(d.votes)
        .map(([party, v]): CandidateRow => [names[party] ?? party, party, v])
        .sort((a, b) => b[2] - a[2]),
    }))
    .sort((a, b) => a.division.localeCompare(b.division));
}

/** URL slug from a constituency name: "Carriacou & Petite Martinique" → "carriacou-and-petite-martinique". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(".", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The page for a constituency, addressed by its name. */
export function constituencyHref(
  data: ResultsFile,
  code: ConstituencyCode
): string {
  return `/constituencies/${slugify(constituencyName(data, code))}`;
}

/** The code for a slug: a name slug, or (for old links) a PEO letter. */
export function codeFromSlug(
  data: ResultsFile,
  slug: string
): ConstituencyCode | null {
  const letter = slug.toUpperCase();
  if ((CODES as readonly string[]).includes(letter))
    return letter as ConstituencyCode;
  return (
    CODES.find((code) => slugify(constituencyName(data, code)) === slug) ?? null
  );
}
