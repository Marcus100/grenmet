import { getPayload } from "payload";
import {
  ARTICLE_COLLECTIONS,
  type ArticleCollection,
  findArticles,
  isArticleCollection,
  NO_STORE,
} from "../../../../lib/public-feed";
import { reportError } from "../../../../lib/report-error";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

/**
 * Anonymous, published-only articles. `collection` narrows to one of
 * desk-updates, stories or report-notes; `slug` finds one article (slugs are
 * unique across collections because each carries its collection prefix).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  const slug = url.searchParams.get("slug") ?? undefined;
  if (collection && !isArticleCollection(collection))
    return Response.json(
      { error: "Unknown collection" },
      { status: 400, headers: NO_STORE }
    );
  const collections: ArticleCollection[] = collection
    ? [collection as ArticleCollection]
    : (Object.keys(ARTICLE_COLLECTIONS) as ArticleCollection[]);
  try {
    const payload = await getPayload({ config });
    const lists = await Promise.all(
      collections.map((name) => findArticles(payload, name, { slug }))
    );
    const articles = lists
      .flat()
      .sort((a, b) =>
        (b.publishedAt ?? b.updatedAt).localeCompare(
          a.publishedAt ?? a.updatedAt
        )
      );
    return Response.json({ articles }, { headers: NO_STORE });
  } catch (error) {
    reportError(error, "cms-public-articles");
    return Response.json(
      { error: "Content is unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
}
