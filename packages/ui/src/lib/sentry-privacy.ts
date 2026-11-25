export const sentryIgnoredSpans = [/.*/u];

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

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/u;

/** UUID or short token; rejects emails, names and anything with spaces or "@". */
function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value);
}

/**
 * ADR-0037: the internal user ID (an opaque database ID) may be sent; every
 * other user field (email, username, ip_address, name, ...) is dropped.
 */
function keepUserId(user: unknown): { id: string } | undefined {
  if (!user || typeof user !== "object") return undefined;
  const id = (user as { id?: unknown }).id;
  return isOpaqueId(id) ? { id } : undefined;
}

function keepSafeTags(tags: unknown): Record<string, string> | undefined {
  if (!tags || typeof tags !== "object") return undefined;
  const kept = Object.fromEntries(
    Object.entries(tags).filter(
      ([key, value]) =>
        SAFE_TAGS.has(key) &&
        typeof value === "string" &&
        (key !== "user_id" || isOpaqueId(value))
    )
  );
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Error types the JavaScript engine or browser raises itself. Their messages are
 * written by the runtime (for example "Cannot read properties of undefined
 * (reading 'name')"), so after masking they are kept: without them an error
 * cannot be diagnosed. Messages of every other type, including app-thrown
 * `Error`s that may carry customer text, stay "[redacted]".
 */
const RUNTIME_ERROR_TYPES = new Set([
  "AbortError",
  "ChunkLoadError",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
]);
const SAFE_TEXT_LIMIT = 200;
const URL_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/\S+/giu;
const EMAIL_TEXT = /[^\s@<>"'`]+@[^\s@<>"'`]+\.[a-z]{2,}/giu;
// Long tokens with at least one digit (IDs, keys); long code words have none.
const TOKEN_TEXT = /\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{20,}\b/gu;
const LONG_NUMBER_TEXT = /\+?\d(?:[\s().-]*\d){6,}/gu;
const QUOTED_TEXT = /(["'`])([^"'`]*)\1/gu;
const IDENTIFIER = /^[A-Za-z_$][\w$.]{0,40}$/u;

/**
 * A runtime error message with anything that could be customer content masked:
 * links, emails, long numbers, tokens and quoted text other than a code name.
 */
export function safeErrorText(text: string): string {
  return (
    text
      .replace(URL_TEXT, "<url>")
      .replace(EMAIL_TEXT, "<email>")
      .replace(TOKEN_TEXT, "<id>")
      .replace(LONG_NUMBER_TEXT, "<number>")
      // Engines quote code names in single quotes ("reading 'name'"); double
      // quotes hold data snippets (JSON.parse), so they are always masked.
      .replace(QUOTED_TEXT, (match, quote: string, inner: string) =>
        quote !== '"' && IDENTIFIER.test(inner)
          ? match
          : `${quote}<text>${quote}`
      )
      .slice(0, SAFE_TEXT_LIMIT)
  );
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
    if (exception.value) {
      exception.value =
        exception.type && RUNTIME_ERROR_TYPES.has(exception.type)
          ? safeErrorText(exception.value)
          : "[redacted]";
    }
    for (const frame of exception.stacktrace?.frames ?? [])
      frame.vars = undefined;
  }
  return event;
}

/** Performance stays off until quota and span sanitation have delivery evidence. */
export function scrubSentryTransaction(_event: unknown): null {
  return null;
}
