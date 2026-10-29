import type { CollectionAfterChangeHook } from "payload";

export const PUBLICATION_ACTIONS = [
  "published",
  "unpublished",
  "scheduled-publish",
  "scheduled-unpublish",
] as const;
export type PublicationAction = (typeof PUBLICATION_ACTIONS)[number];

export interface PublicationEvent {
  action: PublicationAction;
  /** When the change takes effect, for scheduled changes only. */
  scheduledFor: string | null;
}

interface Snapshot {
  publishAt?: unknown;
  status?: unknown;
  unpublishAt?: unknown;
}

const isFuture = (value: unknown, now: Date) =>
  typeof value === "string" &&
  value !== "" &&
  new Date(value).getTime() > now.getTime();

/**
 * What one save changes for the public site. Going live or coming down is
 * logged when it is saved; a future show-from or take-off time is logged as a
 * scheduled change instead, with the time it will take effect. A take-off
 * time that passes later is not a save, so it is not logged again.
 */
export function publicationEvents(
  before: Snapshot | undefined,
  after: Snapshot,
  now: Date = new Date()
): PublicationEvent[] {
  const wasPublished = before?.status === "published";
  const isPublished = after.status === "published";
  const events: PublicationEvent[] = [];
  if (!wasPublished && isPublished) {
    events.push(
      isFuture(after.publishAt, now)
        ? {
            action: "scheduled-publish",
            scheduledFor: String(after.publishAt),
          }
        : { action: "published", scheduledFor: null }
    );
  }
  if (wasPublished && !isPublished) {
    events.push({ action: "unpublished", scheduledFor: null });
  }
  if (
    isPublished &&
    isFuture(after.unpublishAt, now) &&
    after.unpublishAt !== before?.unpublishAt
  ) {
    events.push({
      action: "scheduled-unpublish",
      scheduledFor: String(after.unpublishAt),
    });
  }
  return events;
}

/**
 * After-save hook for an editorial collection: writes one record per event,
 * in the same transaction, naming the signed-in editor who made the change.
 */
export function recordPublication(
  collection: string,
  titleField: string
): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, req }) => {
    const events = publicationEvents(previousDoc, doc, new Date());
    for (const event of events) {
      await req.payload.create({
        collection: "publication-log",
        overrideAccess: true,
        req,
        data: {
          action: event.action,
          scheduledFor: event.scheduledFor,
          collection,
          documentId: String(doc.id),
          title: String(doc[titleField] ?? doc.slug ?? doc.id).slice(0, 200),
          actor: req.user?.id ?? null,
        },
      });
    }
    return doc;
  };
}
