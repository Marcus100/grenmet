export interface SiteSearchEntry {
  href: string;
  keywords: string[];
  kind: "Guide" | "Person" | "Party" | "Election" | "Constituency" | "Tool";
  summary: string;
  title: string;
}
const MARKS = /[\u0300-\u036f]/g;
const PUNCTUATION = /[^a-z0-9]+/g;
function normalise(value: string) {
  return value
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .trim();
}
/** Exact titles first; all query words must occur, so a partial match cannot bury a precise one. */
export function searchSite(
  index: SiteSearchEntry[],
  query: string,
  limit = 20
): SiteSearchEntry[] {
  const q = normalise(query);
  if (q.length < 2) return [];
  const words = q.split(" ");
  return index
    .flatMap((entry) => {
      const title = normalise(entry.title);
      const aliases = entry.keywords.map(normalise);
      const haystack = `${title} ${aliases.join(" ")} ${normalise(entry.summary)}`;
      if (!words.every((word) => haystack.includes(word))) return [];
      let score = 4;
      if (title === q) score = 0;
      else if (aliases.includes(q)) score = 1;
      else if (title.startsWith(q)) score = 2;
      else if (title.includes(q)) score = 3;
      return [{ entry, score }];
    })
    .sort(
      (a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title)
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}
