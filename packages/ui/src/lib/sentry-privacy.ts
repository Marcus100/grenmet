export const sentryIgnoredSpans = [/.*/];

/** Explicit opt-outs keep SDK upgrades from broadening customer-data collection. */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  stackFrameVariables: false,
  frameContextLines: 0,
};
interface ErrorEvent {
  breadcrumbs?: unknown;
  contexts?: unknown;
  exception?: {
    values?: {
      value?: string;
      type?: string;
      stacktrace?: {
        frames?: {
          vars?: unknown;
          filename?: string;
          lineno?: number;
          colno?: number;
        }[];
      };
    }[];
  };
  extra?: unknown;
  logentry?: unknown;
  message?: string;
  request?: unknown;
  tags?: unknown;
  transaction?: string;
  user?: unknown;
}

/**
 * Tags that carry no customer content or identity and are kept on events:
 * `digest` links a Server Component error to its server log line, `area`
 * names the product surface that reported a caught error, and `request_id` is
 * the random per-request token the API returns in `X-Request-ID`, and `user_id`
 * and `org_id` are opaque internal database IDs (ADR-0037). Keep in step with `SAFE_TAGS` in `apps/api/fastapi/src/telemetry.py`.
 */
const SAFE_TAGS = new Set([
  "area",
  "digest",
  "org_id",
  "request_id",
  "user_id",
]);

/**
 * ADR-0037: the internal user ID (an opaque database ID) may be sent; every
 * other user field (email, username, ip_address, name, ...) is dropped.
 */
function keepUserId(user: unknown): { id: string } | undefined {
  if (!user || typeof user !== "object") return undefined;
  const id = (user as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? { id } : undefined;
}

function keepSafeTags(tags: unknown): Record<string, string> | undefined {
  if (!tags || typeof tags !== "object") return undefined;
  const kept = Object.fromEntries(
    Object.entries(tags).filter(
      ([key, value]) => SAFE_TAGS.has(key) && typeof value === "string"
    )
  );
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** Keep error types and stack locations, excluding customer content and identity. */
export function scrubSentryEvent<T extends ErrorEvent>(event: T): T {
  event.user = keepUserId(event.user);
  event.request = undefined;
  event.extra = undefined;
  event.breadcrumbs = undefined;
  event.contexts = undefined;
  event.tags = keepSafeTags(event.tags);
  event.logentry = undefined;
  event.transaction = undefined;
  if (event.message) event.message = "[redacted]";
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = "[redacted]";
    for (const frame of exception.stacktrace?.frames ?? [])
      frame.vars = undefined;
  }
  return event;
}

/** Performance stays off until quota and span sanitation have delivery evidence. */
export function scrubSentryTransaction(_event: unknown): null {
  return null;
}
