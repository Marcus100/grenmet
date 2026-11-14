// Whether an event page has a published listing, asked by the proxy before the
// page renders. Server only: it reads the server-only API address.

import "server-only";

import {
  createClient,
  eventsGetListing,
  ResponseError,
} from "@barrelsgd/api-client";
import { env } from "@/env";
import { visitorHeaders } from "@/lib/visitor-headers";

interface HeaderReader {
  get: (name: string) => string | null;
}

/** How long each kind of answer is kept, so repeat visits do not each cost a call. */
export const EVENT_ANSWER_TTL_MS = {
  /** The event exists: a cancelled or unpublished one is rare. */
  exists: 60_000,
  /** No such event: kept briefly, so a newly published event shows within seconds. */
  missing: 10_000,
  /** The API could not answer: kept briefly so a stall does not slow every request. */
  unknown: 5000,
} as const;
/** The API gets this long to answer before the page is left to decide. */
export const EVENT_TIMEOUT_MS = 3000;
const MAX_ANSWERS = 500;
const answers = new Map<string, { at: number; exists: boolean | null }>();

function ttlFor(exists: boolean | null): number {
  if (exists === null) {
    return EVENT_ANSWER_TTL_MS.unknown;
  }
  return exists ? EVENT_ANSWER_TTL_MS.exists : EVENT_ANSWER_TTL_MS.missing;
}

/** Forgets every kept answer. For tests. */
export function forgetEventAnswers(): void {
  answers.clear();
}

/**
 * True when `slug` is a published event, false when the API says there is none
 * (404, or 422 for a slug it cannot read), and null when the API could not
 * answer in time: the page then makes the call itself and decides. A listing's
 * visibility does not depend on who asks, so no member token is sent. Answers
 * are kept for `EVENT_ANSWER_TTL_MS`.
 */
export async function eventExists(
  slug: string,
  incoming: HeaderReader,
  now: number = Date.now()
): Promise<boolean | null> {
  const kept = answers.get(slug);
  if (kept && now - kept.at < ttlFor(kept.exists)) {
    return kept.exists;
  }
  let exists: boolean | null;
  try {
    await eventsGetListing({
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
      signal: AbortSignal.timeout(EVENT_TIMEOUT_MS),
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
