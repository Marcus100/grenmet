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

/** Keep error types and stack locations, excluding customer content and identity. */
export function scrubSentryEvent<T extends ErrorEvent>(event: T): T {
  event.user = undefined;
  event.request = undefined;
  event.extra = undefined;
  event.breadcrumbs = undefined;
  event.contexts = undefined;
  event.tags = undefined;
  event.logentry = undefined;
  event.transaction = undefined;
  if (event.message) event.message = "[redacted]";
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = "[redacted]";
  }
  return event;
}
