import type { Payload, Where } from "payload";
import {
  LIVE_POST_PATH,
  type SiteCollection,
  siteAddress,
  sitePath,
} from "./gms-site";
import { liveWhere } from "./publication-window";

/**
 * The posts the daily digest reads (FastAPI `src/subscriptions/newsletter.py`,
 * `_FeedPost`): `{"items": [{title, url, summary, includeInNewsletter,
 * publishedAt}]}`. Only posts ticked "Include in newsletter" and published
 * inside the window come back; FastAPI keeps the ones published on the day
 * it sends, so a short window keeps the feed small.
 */
export const NEWSLETTER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const NEWSLETTER_ITEM_LIMIT = 100;
const PER_COLLECTION_LIMIT = 50;

export const NEWSLETTER_COLLECTIONS = [
  "desk-updates",
  "stories",
  "report-notes",
  "live-posts",
] as const;
export type NewsletterCollection = (typeof NEWSLETTER_COLLECTIONS)[number];

export interface NewsletterItem {
  includeInNewsletter: true;
  publishedAt: string;
  summary: string;
  title: string;
  url: string;
}

type Doc = Record<string, unknown>;

/** One ticked post as the digest reads it, or null if it cannot be linked. */
export function toNewsletterItem(
  collection: NewsletterCollection,
  doc: Doc,
  origin: string
): NewsletterItem | null {
  const publishedAt =
    typeof doc.publishedAt === "string" ? doc.publishedAt : null;
  const title = String(doc.title ?? "").trim();
  if (!(publishedAt && title)) return null;
  if (collection === "live-posts") {
    return {
      title,
      url: siteAddress(origin, LIVE_POST_PATH),
      summary: String(doc.text ?? "").trim(),
      includeInNewsletter: true,
      publishedAt,
    };
  }
  return {
    title,
    url: siteAddress(
      origin,
      sitePath(collection as SiteCollection, String(doc.slug))
    ),
    summary: String(doc.summary ?? "").trim(),
    includeInNewsletter: true,
    publishedAt,
  };
}

/** Ticked posts published in the window, newest first, read with public rules. */
export async function findNewsletterItems(
  payload: Payload,
  { now = new Date(), origin }: { now?: Date; origin: string }
): Promise<NewsletterItem[]> {
  const since = new Date(now.getTime() - NEWSLETTER_WINDOW_MS).toISOString();
  const lists = await Promise.all(
    NEWSLETTER_COLLECTIONS.map(async (collection) => {
      // A live post shows in the digest only while it is current, and only as a
      // general update (the other tabs have no page to link to).
      const extra: Where[] =
        collection === "live-posts"
          ? [
              { kind: { equals: "update" } },
              {
                or: [
                  { expiresAt: { exists: false } },
                  { expiresAt: { greater_than: now.toISOString() } },
                ],
              },
            ]
          : [];
      const result = await payload.find({
        collection,
        overrideAccess: false,
        depth: 0,
        limit: PER_COLLECTION_LIMIT,
        sort: "-publishedAt",
        where: liveWhere(
          now,
          { includeInNewsletter: { equals: true } },
          { publishedAt: { greater_than: since } },
          ...extra
        ),
      });
      return result.docs.flatMap((doc) => {
        const item = toNewsletterItem(
          collection,
          doc as unknown as Doc,
          origin
        );
        return item ? [item] : [];
      });
    })
  );
  return lists
    .flat()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, NEWSLETTER_ITEM_LIMIT);
}
