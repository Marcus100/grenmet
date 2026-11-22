import { type ContentResult, contentHref } from "@/lib/cms";
import type { SearchArticle } from "@/lib/search";

const SECTION_LABEL: Record<string, string> = {
  "desk-updates": "From the Desk",
  stories: "Stories",
};

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
