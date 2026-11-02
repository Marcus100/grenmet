/**
 * Which CMS item a site address shows, for the proxy's existence check. Pure
 * and free of server-only imports so the proxy can use it. The prefixes mirror
 * `ROUTES` and `questionHref` in `lib/cms.ts`; `cms-item.test.ts` checks that
 * every address the site builds maps back to its slug.
 */
export interface CmsItemLookup {
  /** The CMS public list endpoint (`/api/public/<endpoint>`) and its JSON key. */
  endpoint: "articles" | "questions" | "quizzes";
  /** The CMS slug, as the page asks for it. */
  slug: string;
}

const ARTICLE_PREFIXES: Record<string, string> = {
  news: "stories/",
  updates: "updates/",
  reports: "reports/",
};

/** The CMS item behind an `/explore/...` item address, or null for any other path. */
export function cmsItemForPath(pathname: string): CmsItemLookup | null {
  let parts: string[];
  try {
    parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [root, kind, ...rest] = parts;
  if (root !== "explore" || kind === undefined || rest.length === 0) {
    return null;
  }
  const prefix = ARTICLE_PREFIXES[kind];
  if (prefix) {
    return { endpoint: "articles", slug: prefix + rest.join("/") };
  }
  if (rest.length !== 1) {
    return null;
  }
  if (kind === "explained") {
    return { endpoint: "questions", slug: `questions/${rest[0]}` };
  }
  if (kind === "quiz") {
    return { endpoint: "quizzes", slug: `discover/${rest[0]}` };
  }
  return null;
}
