import type { ZodType } from "zod";

// Fetching with a last-known-good store. When the API errors or times out,
// the most recent good answer for that path is returned flagged `stale`, so a
// public warning page keeps showing real data instead of going blank. Only a
// successful, schema-valid answer is ever remembered.

export type FeedResult<T> =
  | { status: "ok"; data: T; fetchedAt: Date }
  | { status: "stale"; data: T; fetchedAt: Date }
  | { status: "not-found" }
  | { status: "unavailable" };

export interface FeedClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Cap on remembered paths, so odd URLs cannot grow the store forever. */
  maxEntries?: number;
  /** Last-known-good older than this is dropped as too old to show. */
  maxStaleMs?: number;
  now?: () => Date;
  /** Called with the failure; the caller decides whether to report it. */
  onError?: (error: unknown, path: string) => void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
// A warning shown from memory for longer than this is more risk than help.
const DEFAULT_MAX_STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

interface Remembered {
  data: unknown;
  fetchedAt: Date;
}

export function createFeedClient(options: FeedClientOptions) {
  const {
    baseUrl,
    fetchImpl = fetch,
    onError,
    maxStaleMs = DEFAULT_MAX_STALE_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    now = () => new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const lastGood = new Map<string, Remembered>();

  function remember(path: string, data: unknown, fetchedAt: Date) {
    lastGood.delete(path);
    lastGood.set(path, { data, fetchedAt });
    while (lastGood.size > maxEntries) {
      const oldest = lastGood.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      lastGood.delete(oldest);
    }
  }

  function fallback<T>(path: string): FeedResult<T> {
    const kept = lastGood.get(path);
    if (kept && now().getTime() - kept.fetchedAt.getTime() <= maxStaleMs) {
      return {
        data: kept.data as T,
        fetchedAt: kept.fetchedAt,
        status: "stale",
      };
    }
    return { status: "unavailable" };
  }

  async function get<T>(
    path: string,
    schema: ZodType<T>
  ): Promise<FeedResult<T>> {
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        cache: "no-store",
        // A hung service is worse than a refused connection: without a
        // deadline the render waits on it and the page never resolves.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404) {
        return { status: "not-found" };
      }
      if (!response.ok) {
        throw new Error(`${path} responded ${response.status}`);
      }
      const data = schema.parse(await response.json());
      const fetchedAt = now();
      remember(path, data, fetchedAt);
      return { data, fetchedAt, status: "ok" };
    } catch (error) {
      onError?.(error, path);
      return fallback<T>(path);
    }
  }

  return {
    get,
    /** Test hook: forget everything. */
    reset: () => lastGood.clear(),
  };
}
