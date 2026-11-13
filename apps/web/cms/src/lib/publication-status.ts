/**
 * The workflow status every CMS document carries. Kept dependency-free so the
 * access rules, hooks, feed builders and field options can all import it
 * without a cycle. `DOCUMENT_STATUSES` mirrors the status type Payload
 * generates into `payload-types.ts`; `publication-status.test.ts` fails if
 * they drift apart.
 */
export const DOCUMENT_STATUSES = ["draft", "review", "published"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** The only status a reader can see. Every "is it live" check uses this. */
export const PUBLISHED = "published" as const;

/** True when the document is published (ignores the show-from / take-off window). */
export function isLive(doc: { status?: unknown } | null | undefined): boolean {
  return doc?.status === PUBLISHED;
}
