import "server-only";
import type { CmsItemLookup } from "@/lib/cms-item";
import { env } from "@/lib/env";

/** Answers are kept this long, so repeat visits do not each cost an extra call. */
export const CMS_ANSWER_TTL_MS = 60_000;
const MAX_ANSWERS = 500;
const answers = new Map<string, { at: number; exists: boolean }>();

/** Forgets every kept answer. For tests. */
export function forgetCmsAnswers(): void {
  answers.clear();
}

/**
 * True when the CMS has the published item, false when it answers with none,
 * and null when it cannot answer (not configured, down, or an unexpected
 * reply): the page then asks itself and shows its own message. Definite
 * answers are kept for a minute. Same public endpoints as `lib/cms.ts`.
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
  if (kept && now - kept.at < CMS_ANSWER_TTL_MS) {
    return kept.exists;
  }
  let exists: boolean;
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
    if (!Array.isArray(list)) {
      return null;
    }
    exists = list.length > 0;
  } catch {
    return null;
  }
  if (answers.size >= MAX_ANSWERS) {
    const oldest = answers.keys().next().value;
    if (oldest !== undefined) {
      answers.delete(oldest);
    }
  }
  answers.set(key, { at: now, exists });
  return exists;
}
