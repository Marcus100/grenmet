import { fetchPublishedContent } from "@/lib/cms";
import { searchArticles } from "@/lib/search-articles";

/**
 * Published CMS articles for site search. A read-only proxy of the public CMS
 * feed (no business logic): titles, summaries and links only. An unavailable
 * CMS returns an empty list, so search still covers every menu page.
 */
export async function GET() {
  const result = await fetchPublishedContent();
  return Response.json(
    { articles: searchArticles(result), status: result.status },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
  );
}
