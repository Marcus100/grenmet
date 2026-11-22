import { unstable_cache } from "next/cache";
import {
  type ContentResult,
  contentHref,
  fetchPublishedContent,
} from "@/lib/cms";
import type { SearchArticle } from "@/lib/search";

const SECTION_LABEL: Record<string, string> = {
  "desk-updates": "From the Desk",
  stories: "Stories",
};

/** How long search keeps the CMS article list, so bots cannot reach the CMS per request. */
export const SEARCH_ARTICLES_REVALIDATE_SECONDS = 300;

/**
 * The CMS feed as site search sees it: titles, summaries and links only. An
 * unavailable CMS gives no articles, so search still covers every menu page.
 * Shared by `/api/search` (the site search dialog) and the `/search` page.
 */
export function searchArticles(result: ContentResult): SearchArticle[] {
  return result.articles.map((content) => ({
    title: content.title,
    summary: content.summary ?? "",
    href: contentHref(content),
    section: SECTION_LABEL[content.collection] ?? "Stories",
  }));
}

/**
 * Published articles for the `/search` page, cached for five minutes. The CMS
 * fetch itself is uncached (`no-store`), so without this every search request,
 * including a bot's, would reach the CMS. An outage is cached too, for the same
 * five minutes: search then shows the menu pages only.
 */
export const loadSearchArticles = unstable_cache(
  async () => searchArticles(await fetchPublishedContent()),
  ["gms-search-articles"],
  { revalidate: SEARCH_ARTICLES_REVALIDATE_SECONDS }
);
