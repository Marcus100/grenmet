import "server-only";
import type { CmsItemLookup } from "@/lib/cms-item";
import { env } from "@/lib/env";

/** How long each kind of answer is kept, so repeat visits do not each cost a call. */
export const CMS_ANSWER_TTL_MS = {
  /** The item exists: it rarely disappears. */
  exists: 60_000,
  /** No such item: kept briefly, so a newly published item shows within seconds. */
  missing: 10_000,
  /** The CMS could not answer: kept briefly so a stall does not slow every request. */
  unknown: 5000,
} as const;
const MAX_ANSWERS = 500;
const answers = new Map<string, { at: number; exists: boolean | null }>();

function ttlFor(exists: boolean | null): number {
  if (exists === null) {
    return CMS_ANSWER_TTL_MS.unknown;
  }
  return exists ? CMS_ANSWER_TTL_MS.exists : CMS_ANSWER_TTL_MS.missing;
}

/** Forgets every kept answer. For tests. */
export function forgetCmsAnswers(): void {
  answers.clear();
}

/**
 * True when the CMS has the published item, false when it answers with none,
 * and null when it cannot answer (not configured, down, or an unexpected
 * reply): the page then asks itself and shows its own message. Answers are
 * kept for `CMS_ANSWER_TTL_MS`. Same public endpoints as `lib/cms.ts`.
 */
export async function cmsItemExists(
  item: CmsItemLookup,
  now: number = Date.now()
): Promise<boolean | null> {
  if (!env.CMS_API_URL) {
    return null;
  }
  const key = `${item.endpoint}:${item.slug}`;
  const kept = answers.get(key);
  if (kept && now - kept.at < ttlFor(kept.exists)) {
    return kept.exists;
  }
  const exists = await ask(item);
  remember(key, { at: now, exists });
  return exists;
}

/** One call to the CMS; null for anything but a clear list. */
async function ask(item: CmsItemLookup): Promise<boolean | null> {
  try {
    const url = new URL(`/api/public/${item.endpoint}`, env.CMS_API_URL);
    url.searchParams.set("slug", item.slug);
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    const list =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)[item.endpoint]
        : undefined;
    return Array.isArray(list) ? list.length > 0 : null;
  } catch {
    return null;
  }
}

/** Keeps an answer as the newest entry, dropping the oldest when full. */
function remember(
  key: string,
  answer: { at: number; exists: boolean | null }
): void {
  // Re-inserting moves the key to the end, so a live entry is not evicted early.
  answers.delete(key);
  if (answers.size >= MAX_ANSWERS) {
    const oldest = answers.keys().next().value;
    if (oldest !== undefined) {
      answers.delete(oldest);
    }
  }
  answers.set(key, answer);
}
