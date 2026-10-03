import "server-only";

import { buildPeople, type Person } from "@/data/candidates";
import featuresJson from "@/data/derived/features.json";
import geoJson from "@/data/derived/geo";
import referendumJson from "@/data/derived/referendum";
import registerJson from "@/data/derived/register";
import resultsJson from "@/data/derived/results";
import type { Data, ReferendumFile } from "@/data/events";
import type { RegisterFile } from "@/data/register";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile, GeoFile, ResultsFile } from "@/data/types";

/**
 * Server-only access to the archive assembled from small JSON records.
 * Pages pass interactive components only the data they need.
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

const snapshots = register.snapshots;

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

export { default as discrepancies } from "@/data/derived/discrepancies";
export { default as validation } from "@/data/derived/validation.json";
