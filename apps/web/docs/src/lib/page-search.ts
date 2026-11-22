export interface DocPage {
  description: string;
  /** The public path, for example `/appendix/mbia-vehicles`. */
  path: string;
  title: string;
}

const NON_WORD = /[^\p{L}\p{N}]+/u;
const words = (text: string) =>
  text.toLowerCase().split(NON_WORD).filter(Boolean);

/**
 * Pages whose title or description has every query word as a word prefix. A
 * title match ranks above a description match, and a title that starts with
 * the whole query ranks first. Server-side and read-only: the page list is the
 * content collection itself, so no query is stored or sent anywhere.
 */
export function searchPages(
  pages: readonly DocPage[],
  query: string,
  limit = 20
): DocPage[] {
  const terms = words(query);
  if (terms.length === 0) return [];
  const phrase = terms.join(" ");
  const scored: { page: DocPage; score: number }[] = [];
  for (const page of pages) {
    const title = words(page.title);
    const description = words(page.description);
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      if (title.some((word) => word.startsWith(term))) {
        score += 3;
      } else if (description.some((word) => word.startsWith(term))) {
        score += 1;
      } else {
        matchedAll = false;
        break;
      }
    }
    if (!matchedAll) continue;
    if (title.join(" ").startsWith(phrase)) score += 5;
    scored.push({ page, score });
  }
  return scored
    .sort(
      (a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title)
    )
    .slice(0, limit)
    .map(({ page }) => page);
}
