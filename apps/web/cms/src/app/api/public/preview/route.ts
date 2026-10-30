import { getPayload, NotFound } from "payload";
import { getEnv } from "../../../../env";
import { readPreviewToken } from "../../../../lib/preview-link";
import {
  type ArticleCollection,
  isArticleCollection,
  toArticle,
  toLivePost,
  toQuestion,
} from "../../../../lib/public-feed";
import { reportError } from "../../../../lib/report-error";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

const WHOLE_NUMBER = /^\d+$/u;

/** Drafts must never be cached or indexed. */
const PREVIEW_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

const NOT_FOUND = () =>
  Response.json(
    { error: "This preview link is not valid or has expired." },
    { status: 404, headers: PREVIEW_HEADERS }
  );

/** The same public shape the site reads for a published item. */
function shape(collection: string, doc: Record<string, unknown>) {
  if (isArticleCollection(collection))
    return toArticle(collection as ArticleCollection, doc);
  if (collection === "live-posts") return toLivePost(doc);
  return toQuestion(doc);
}

/**
 * Anonymous preview of one unpublished item, for the weather site's preview
 * page. The signed token is the only authority: it names one document and
 * expires after two hours. Only the public fields come back, never staff
 * fields. The status tells the page it is a draft.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const claim = readPreviewToken(token, { secret: getEnv().PAYLOAD_SECRET });
  if (!claim) return NOT_FOUND();
  try {
    const payload = await getPayload({ config });
    const id = WHOLE_NUMBER.test(claim.id) ? Number(claim.id) : claim.id;
    const doc = (await payload.findByID({
      collection: claim.collection,
      id,
      depth: 1,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null;
    if (!doc) return NOT_FOUND();
    return Response.json(
      {
        preview: {
          collection: claim.collection,
          status: String(doc.status ?? "draft"),
          publishAt: (doc.publishAt as string | undefined) ?? null,
          unpublishAt: (doc.unpublishAt as string | undefined) ?? null,
          item: shape(claim.collection, doc),
        },
      },
      { headers: PREVIEW_HEADERS }
    );
  } catch (error) {
    // A document deleted since the link was made is simply not found.
    if (error instanceof NotFound) return NOT_FOUND();
    reportError(error, "cms-public-preview");
    return Response.json(
      { error: "The preview is unavailable" },
      { status: 503, headers: PREVIEW_HEADERS }
    );
  }
}
