import { type Data, eventNational, eventResult } from "@/data/events";
import { metricEvidence } from "@/data/evidence";
import {
  CODES,
  contestStats,
  EVENTS,
  MAPPED_YEARS,
  seatTwoParty,
} from "@/data/model";
import type { ConstituencyCode, ResultsFile } from "@/data/types";

/**
 * Plain-language facts for the Trends fact sheet, calculated from the
 * archive so the wording can never drift from the charts.
 */

const GENERAL = EVENTS.filter((e) => e.kind === "general");

function topParty(seats: Record<string, number>): [string, number] {
  return Object.entries(seats).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
}

export interface TurnoutFact {
  official: boolean;
  turnout: number;
  year: number;
}

/** Highest and lowest general-election turnout on record. */
export function turnoutRange(data: Data): {
  high: TurnoutFact;
  low: TurnoutFact;
} {
  const rows = GENERAL.flatMap((e) => {
    const t = eventNational(data, e.id).turnout;
    return t == null
      ? []
      : [
          {
            year: e.year,
            turnout: t,
            official: metricEvidence(data, e.id, "turnout").official,
          },
        ];
  }).sort((a, b) => b.turnout - a.turnout);
  const high = rows[0];
  const low = rows.at(-1);
  if (!(high && low)) throw new Error("No turnout figures in the archive");
  return { high, low };
}

export interface SweepFact {
  party: string;
  seats: number;
  voteShare: number;
  year: number;
}

/** Elections where one party won every seat, with its share of the vote. */
export function sweeps(data: Data): SweepFact[] {
  return GENERAL.flatMap((e) => {
    const n = eventNational(data, e.id);
    const total = Object.values(n.seats).reduce((a, b) => a + b, 0);
    const [party, seats] = topParty(n.seats);
    return total > 0 && seats === total && n.total > 0
      ? [
          {
            year: e.year,
            party,
            seats,
            voteShare: (n.votes[party] ?? 0) / n.total,
          },
        ]
      : [];
  });
}

export interface ClosestFact {
  code: ConstituencyCode;
  majority: number;
  year: number;
}

/** The narrowest constituency result among officially sourced elections. */
export function closestResult(data: Data): ClosestFact {
  const rows = GENERAL.filter(
    (e) => metricEvidence(data, e.id, "votes").official && e.map
  ).flatMap((e) =>
    CODES.flatMap((code) => {
      const r = eventResult(data, e.id, code);
      return r && r.c.length > 1
        ? [{ year: e.year, code, majority: contestStats(r).majority }]
        : [];
    })
  );
  const closest = rows.sort((a, b) => a.majority - b.majority)[0];
  if (!closest) throw new Error("No constituency results in the archive");
  return closest;
}

/** The 15 winning margins of one election, closest first, and the middle one. */
export function marginsExample(
  data: Data,
  year: string
): { margins: number[]; median: number } {
  const margins = CODES.flatMap((code) => {
    const r = eventResult(data, year, code);
    return r && r.c.length > 1 ? [contestStats(r).margin] : [];
  }).sort((a, b) => a - b);
  const mid = Math.floor(margins.length / 2);
  const median =
    margins.length % 2
      ? (margins[mid] ?? 0)
      : ((margins[mid - 1] ?? 0) + (margins[mid] ?? 0)) / 2;
  return { margins, median };
}

/** The constituency whose 2022 NDC–NNP split was nearest to 50–50. */
export function nearestEven(
  results: ResultsFile,
  year: string
): { code: ConstituencyCode; share: number } {
  const rows = CODES.flatMap((code) => {
    const share = seatTwoParty(results, year, code);
    return share == null ? [] : [{ code, share }];
  }).sort((a, b) => Math.abs(a.share - 0.5) - Math.abs(b.share - 0.5));
  const nearest = rows[0];
  if (!nearest) throw new Error(`No two-party results for ${year}`);
  return nearest;
}

/** How many times each constituency changed party, 1972 to the latest election. */
export function partyChanges(
  data: Data
): { code: ConstituencyCode; changes: number }[] {
  return CODES.map((code) => {
    let changes = 0;
    let last: string | null = null;
    for (const y of MAPPED_YEARS) {
      const party = eventResult(data, String(y), code)?.c[0]?.[1] ?? null;
      if (party && last && party !== last) changes++;
      if (party) last = party;
    }
    return { code, changes };
  }).sort((a, b) => b.changes - a.changes);
}

/** Lowest general-election turnout from an official record. */
export function officialTurnoutLow(data: Data): TurnoutFact {
  const rows = GENERAL.filter(
    (e) => metricEvidence(data, e.id, "turnout").official
  ).flatMap((e) => {
    const t = eventNational(data, e.id).turnout;
    return t == null ? [] : [{ year: e.year, turnout: t, official: true }];
  });
  const low = rows.sort((a, b) => a.turnout - b.turnout)[0];
  if (!low) throw new Error("No official turnout figures in the archive");
  return low;
}

export interface MismatchFact {
  mostSeats: string;
  mostVotes: string;
  year: number;
}

/** Elections where the party with the most votes did not win the most seats. */
export function voteSeatMismatches(data: Data): MismatchFact[] {
  return GENERAL.flatMap((e) => {
    const n = eventNational(data, e.id);
    const [mostSeats, seats] = topParty(n.seats);
    const tied = Object.values(n.seats).filter((k) => k === seats).length > 1;
    // Independents are summed under IND; they are not one party.
    const partyVotes = Object.fromEntries(
      Object.entries(n.votes).filter(([p]) => p !== "IND")
    );
    const mostVotes = topParty(partyVotes)[0];
    return !tied && mostSeats && mostVotes && mostSeats !== mostVotes
      ? [{ year: e.year, mostSeats, mostVotes }]
      : [];
  });
}

/** Highest share of the vote one party (or group of parties) has won, and when. */
export function peakShare(
  data: Data,
  parties: string[]
): { share: number; year: number } | null {
  let best: { share: number; year: number } | null = null;
  for (const e of GENERAL) {
    const n = eventNational(data, e.id);
    if (!n.total) continue;
    const share = parties.reduce((a, p) => a + (n.votes[p] ?? 0), 0) / n.total;
    if (share > 0 && (!best || share > best.share))
      best = { share, year: e.year };
  }
  return best;
}

/** Strongest NDC and NNP constituencies by two-party share in one election. */
export function twoPartyExtremes(
  results: ResultsFile,
  year: string
): {
  ndc: { code: ConstituencyCode; share: number };
  nnp: { code: ConstituencyCode; share: number };
} {
  const rows = CODES.flatMap((code) => {
    const share = seatTwoParty(results, year, code);
    return share == null ? [] : [{ code, share }];
  }).sort((a, b) => b.share - a.share);
  const ndc = rows[0];
  const nnp = rows.at(-1);
  if (!(ndc && nnp)) throw new Error(`No two-party results for ${year}`);
  return { ndc, nnp };
}
