import "server-only";

import { buildPeople, type Person } from "@/data/candidates";
import type { Data, ReferendumFile } from "@/data/events";
import type { RegisterFile } from "@/data/register";
import campaignJson from "@/data/source/campaign.json";
import featuresJson from "@/data/source/features.json";
import geoJson from "@/data/source/geo.json";
import referendumJson from "@/data/source/referendum.json";
import registerJson from "@/data/source/register.json";
import resultsJson from "@/data/source/results.json";
import type { CampaignFile, GeoFile, ResultsFile } from "@/data/types";

/**
 * The checked data snapshot, read on the server only so the ~1 MB of JSON
 * never ships to the browser. Pages pass client islands just the slice they
 * need.
 */
export const results = resultsJson as unknown as ResultsFile;
export const campaign = campaignJson as unknown as CampaignFile;
export const geo = geoJson as unknown as GeoFile;
/** Competitiveness by election, computed by the pipeline from constituency results. */
export const features = featuresJson as unknown as Record<
  string,
  {
    competitive: number;
    flips: number | null;
    marginal: number;
    meanENP: number;
    medianMargin: number;
    safe: number;
    verified: number;
  }
>;
/** Voter-list counts (no individual details). */
export const register = registerJson as unknown as RegisterFile;
export const referendum = referendumJson as unknown as ReferendumFile;
/** Results and referendums together, for the event model. */
export const data: Data = { results, referendum };

interface RegisterSnapshot {
  date: string;
  /** division → [electors, male, female] */
  div: Record<string, [number, number, number]>;
  file: string;
}

const snapshots = (registerJson as unknown as { snapshots: RegisterSnapshot[] })
  .snapshots;

/** Electors on the latest consolidated list (counts only, police excluded). */
export function latestRegister(): {
  date: string;
  electors: number;
  file: string;
} {
  const latest = snapshots.reduce((a, b) => (a.date > b.date ? a : b));
  const electors = Object.values(latest.div).reduce((sum, [n]) => sum + n, 0);
  return { date: latest.date, electors, file: latest.file };
}

/** Electors in one constituency on each consolidated list, oldest first. */
export function registerHistory(
  code: string
): { date: string; electors: number }[] {
  return [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((snap) => ({
      date: snap.date,
      electors: Object.entries(snap.div)
        .filter(([division]) => division.startsWith(code))
        .reduce((sum, [, [n]]) => sum + n, 0),
    }));
}

let peopleCache: Person[] | null = null;

/** Everyone who has stood since 1951, grouped into people (built once). */
export function people(): Person[] {
  peopleCache ??= buildPeople(results);
  return peopleCache;
}
