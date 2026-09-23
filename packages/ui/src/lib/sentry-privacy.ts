interface ErrorEvent {
  breadcrumbs?: unknown;
  contexts?: unknown;
  exception?: { values?: { value?: string }[] };
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
 * `digest` links a Server Component error to its server log line, and `area`
 * names the product surface that reported a caught error.
 */
const SAFE_TAGS = new Set(["area", "digest"]);

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
  event.user = undefined;
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
  }
  return event;
}
