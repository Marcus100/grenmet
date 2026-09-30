import { contentHref, fetchPublishedContent } from "@/lib/cms";
import type { SearchArticle } from "@/lib/search";

const SECTION_LABEL: Record<string, string> = {
  "desk-updates": "From the Desk",
  stories: "Stories",
};

/**
 * Published CMS articles for site search. A read-only proxy of the public CMS
 * feed (no business logic): titles, summaries and links only. An unavailable
 * CMS returns an empty list, so search still covers every menu page.
 */
export async function GET() {
  const result = await fetchPublishedContent();
  const articles: SearchArticle[] = result.articles.map((content) => ({
    title: content.title,
    summary: content.summary ?? "",
    href: contentHref(content),
    section: SECTION_LABEL[content.collection] ?? "Stories",
  }));
  return Response.json(
    { articles, status: result.status },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
  );
}
