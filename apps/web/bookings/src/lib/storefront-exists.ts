// Whether a business has a public booking page, asked by the proxy before the
// page renders. Server only: it reads the server-only API address.

import "server-only";

import {
  bookingsGetStorefront,
  createClient,
  ResponseError,
} from "@barrelsgd/api-client";
import { env } from "@/env";
import { visitorHeaders } from "@/lib/visitor-headers";

interface HeaderReader {
  get: (name: string) => string | null;
}

/** Answers are kept this long, so repeat visits do not each cost an extra call. */
export const STOREFRONT_ANSWER_TTL_MS = 60_000;
/**
 * "Could not tell" is kept only briefly: long enough that a stalled API does
 * not add the timeout to every request, short enough to recover quickly.
 */
export const STOREFRONT_UNKNOWN_TTL_MS = 5000;
/** The API gets this long to answer before the page is left to decide. */
export const STOREFRONT_TIMEOUT_MS = 3000;
const MAX_ANSWERS = 500;
const answers = new Map<string, { at: number; exists: boolean | null }>();

/** Forgets every kept answer. For tests. */
export function forgetStorefrontAnswers(): void {
  answers.clear();
}

/**
 * True when `slug` has a booking page, false when the API says there is none
 * (404, or 422 for a slug it cannot read), and null when the API could not
 * answer in time: the page then makes the call itself and decides. Definite
 * answers are kept for a minute, "could not tell" for five seconds.
 */
export async function storefrontExists(
  slug: string,
  incoming: HeaderReader,
  now: number = Date.now()
): Promise<boolean | null> {
  const kept = answers.get(slug);
  if (kept) {
    const ttl =
      kept.exists === null
        ? STOREFRONT_UNKNOWN_TTL_MS
        : STOREFRONT_ANSWER_TTL_MS;
    if (now - kept.at < ttl) {
      return kept.exists;
    }
  }
  let exists: boolean | null;
  try {
    await bookingsGetStorefront({
      client: createClient({
        baseURL: env.AUTH_API_URL,
        // Rate limits key on the visitor, as for the page's own call.
        headers: visitorHeaders(
          incoming,
          env.TRUSTED_WEB_SECRET,
          env.VISITOR_IP_PROXY_HOPS
        ),
      }),
      path: { slug },
      signal: AbortSignal.timeout(STOREFRONT_TIMEOUT_MS),
    }).unwrap();
    exists = true;
  } catch (error) {
    if (
      error instanceof ResponseError &&
      (error.status === 404 || error.status === 422)
    ) {
      exists = false;
    } else {
      exists = null;
    }
  }
  remember(slug, { at: now, exists });
  return exists;
}

/** Keeps an answer as the newest entry, dropping the oldest when full. */
function remember(
  slug: string,
  answer: { at: number; exists: boolean | null }
): void {
  // Re-inserting moves the key to the end, so a live entry is not evicted early.
  answers.delete(slug);
  if (answers.size >= MAX_ANSWERS) {
    const oldest = answers.keys().next().value;
    if (oldest !== undefined) {
      answers.delete(oldest);
    }
  }
  answers.set(slug, answer);
}
