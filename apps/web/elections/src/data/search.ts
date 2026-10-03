import { CODES, constituencyHref, constituencyName } from "@/data/model";
import type { CampaignFile, GeoFile, ResultsFile } from "@/data/types";

export interface SearchEntry {
  /** Where the result goes: always a constituency page. */
  href: string;
  kind: "constituency" | "place" | "person";
  label: string;
  /** Lower-cased text matched against the query. */
  match: string;
  /** Second line: which constituency, and why it matched. */
  note: string;
}

type Add = (entry: Omit<SearchEntry, "match">) => void;

function addSeats(add: Add, results: ResultsFile) {
  for (const code of CODES)
    add({
      kind: "constituency",
      label: constituencyName(results, code),
      note: `Constituency ${code}`,
      href: constituencyHref(results, code),
    });
}

function addVillages(add: Add, results: ResultsFile, geo: GeoFile) {
  for (const [division, shape] of Object.entries(geo.divisions)) {
    const seat = constituencyName(results, shape.cons);
    for (const village of shape.villages)
      add({
        kind: "place",
        label: village,
        note: `${seat} · polling division ${division}`,
        href: constituencyHref(results, shape.cons),
      });
  }
}

function addStations(add: Add, results: ResultsFile) {
  for (const code of CODES)
    for (const [division, , place] of results.stations["2022"]?.[code] ?? [])
      if (place)
        add({
          kind: "place",
          label: place,
          note: `${constituencyName(results, code)} · polling station, division ${division}`,
          href: constituencyHref(results, code),
        });
}

function addPeople(add: Add, results: ResultsFile, campaign: CampaignFile) {
  for (const code of CODES) {
    const seat = constituencyName(results, code);
    const winner = results.results["2022"]?.[code]?.c[0];
    const sitting =
      campaign.sitting[code] ??
      (winner && { name: winner[0], party: winner[1] });
    if (sitting)
      add({
        kind: "person",
        label: sitting.name,
        note: `${sitting.party} member for ${seat}`,
        href: constituencyHref(results, code),
      });
    for (const [party, slate] of Object.entries(campaign.candidates)) {
      const name = slate[code];
      if (name && name !== sitting?.name)
        add({
          kind: "person",
          label: name,
          note: `${party} candidate for ${seat}`,
          href: constituencyHref(results, code),
        });
    }
  }
}

/**
 * Everything a reader might type to find their constituency: constituency names,
 * villages and polling places, and sitting members and 2026 candidates.
 * Built on the server and served as a static file to the header search.
 */
export function buildSearchIndex(
  results: ResultsFile,
  geo: GeoFile,
  campaign: CampaignFile
): SearchEntry[] {
  const entries = new Map<string, SearchEntry>();
  const add: Add = (entry) => {
    const key = `${entry.kind}:${entry.label.toLowerCase()}:${entry.href}`;
    if (!entries.has(key))
      entries.set(key, { ...entry, match: entry.label.toLowerCase() });
  };
  addSeats(add, results);
  addPeople(add, results, campaign);
  addVillages(add, results, geo);
  addStations(add, results);
  return [...entries.values()];
}

const RANK = { constituency: 0, person: 1, place: 2 } as const;

/** Best matches first: word-start matches, then constituencies, people, places. */
export function searchConstituencies(
  index: SearchEntry[],
  query: string,
  limit = 8
): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return index
    .filter((entry) => entry.match.includes(q))
    .map((entry) => {
      const at = entry.match.indexOf(q);
      const wordStart = at === 0 || entry.match[at - 1] === " ";
      return { entry, score: (wordStart ? 0 : 10) + RANK[entry.kind] };
    })
    .sort(
      (a, b) => a.score - b.score || a.entry.label.localeCompare(b.entry.label)
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}
