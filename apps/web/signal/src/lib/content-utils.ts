/*
  Pure, framework-free helpers over content arrays. Kept separate from
  `content.ts` (which imports the generated `content-collections` module) so
  these can be unit-tested with plain fixtures.
*/

export interface ArticleLike {
  draft: boolean;
  publishedAt: string;
  section: string;
  slug: string;
}

export interface BriefLike {
  date: string;
}

export function sortByPublishedDesc<T extends ArticleLike>(articles: T[]): T[] {
  return [...articles].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function filterPublished<T extends ArticleLike>(articles: T[]): T[] {
  return articles.filter((article) => !article.draft);
}

/** Published only, newest first. */
export function publishedArticles<T extends ArticleLike>(articles: T[]): T[] {
  return sortByPublishedDesc(filterPublished(articles));
}

export function bySection<T extends ArticleLike>(
  articles: T[],
  section: string
): T[] {
  return publishedArticles(articles).filter(
    (article) => article.section === section
  );
}

export function findArticle<T extends ArticleLike>(
  articles: T[],
  section: string,
  slug: string
): T | undefined {
  return articles.find(
    (article) =>
      article.section === section && article.slug === slug && !article.draft
  );
}

export function sortBriefsDesc<T extends BriefLike>(briefs: T[]): T[] {
  return [...briefs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
