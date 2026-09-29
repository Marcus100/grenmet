import { NAV_SECTIONS, type NavSection } from "@/lib/nav-sections";

export interface SearchEntry {
  description: string;
  href: string;
  kind: "page" | "article";
  /** Nav pages not built yet — listed, but marked. */
  planned?: boolean;
  /** Section name, e.g. "Marine"; "Stories" for articles. */
  section: string;
  title: string;
}

/** Published CMS article, as `/api/search` returns it. */
export interface SearchArticle {
  href: string;
  section: string;
  summary: string;
  title: string;
}

/** Every menu page (one entry per href) plus published articles. */
export function buildSearchIndex(
  articles: readonly SearchArticle[] = [],
  sections: readonly NavSection[] = NAV_SECTIONS
): SearchEntry[] {
  const seen = new Set<string>();
  const pages: SearchEntry[] = [];
  for (const section of sections) {
    for (const group of section.groups) {
      for (const link of group.links) {
        if (seen.has(link.href)) {
          continue;
        }
        seen.add(link.href);
        pages.push({
          title: link.name,
          description: link.description,
          href: link.href,
          section: section.label,
          kind: "page",
          planned: link.planned,
        });
      }
    }
  }
  return [
    ...pages,
    ...articles.map((article) => ({
      title: article.title,
      description: article.summary,
      href: article.href,
      section: article.section,
      kind: "article" as const,
    })),
  ];
}

const NON_WORD = /[^\p{L}\p{N}]+/u;
const tokens = (text: string) =>
  text.toLowerCase().split(NON_WORD).filter(Boolean);

/**
 * Every query word must appear (as a word prefix) in the title, description
 * or section. Title matches outrank description matches; a title starting
 * with the query ranks first; built pages outrank planned ones.
 */
export function searchIndex(
  index: readonly SearchEntry[],
  query: string,
  limit = 8
): SearchEntry[] {
  const words = tokens(query);
  if (words.length === 0) {
    return [];
  }
  const phrase = words.join(" ");
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of index) {
    const title = tokens(entry.title);
    const description = tokens(entry.description);
    const section = tokens(entry.section);
    let score = 0;
    let matchedAll = true;
    for (const word of words) {
      const has = (list: string[]) => list.some((t) => t.startsWith(word));
      if (has(title)) {
        score += 5;
      } else if (has(description)) {
        score += 2;
      } else if (has(section)) {
        score += 1;
      } else {
        matchedAll = false;
        break;
      }
    }
    if (!matchedAll) {
      continue;
    }
    if (entry.title.toLowerCase().startsWith(phrase)) {
      score += 10;
    }
    if (entry.planned) {
      score -= 3;
    }
    scored.push({ entry, score });
  }
  return scored
    .sort(
      (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}
