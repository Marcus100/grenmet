import type { Where } from "payload";

/**
 * When a published item is on the public site. An editor can set a time to
 * show it from (`publishAt`) and a time to take it off (`unpublishAt`); with
 * neither set it shows as soon as it is published. Times are checked when a
 * reader asks, so no background job has to run.
 */
export interface PublicationWindow {
  publishAt?: unknown;
  status?: unknown;
  unpublishAt?: unknown;
}

const time = (value: unknown): number | null => {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

/** True when a published document is inside its show-from / take-off window. */
export function isOnSite(
  doc: PublicationWindow,
  now: Date = new Date()
): boolean {
  if (doc.status !== "published") return false;
  const at = now.getTime();
  const from = time(doc.publishAt);
  const until = time(doc.unpublishAt);
  return (from === null || from <= at) && (until === null || until > at);
}

/**
 * A `where` clause for public reads: published, inside the window, plus the
 * caller's own conditions. Every anonymous query goes through this.
 */
export function liveWhere(now: Date, ...conditions: Where[]): Where {
  const at = now.toISOString();
  return {
    and: [
      { status: { equals: "published" } },
      {
        or: [
          { publishAt: { exists: false } },
          { publishAt: { less_than_equal: at } },
        ],
      },
      {
        or: [
          { unpublishAt: { exists: false } },
          { unpublishAt: { greater_than: at } },
        ],
      },
      ...conditions,
    ],
  };
}
