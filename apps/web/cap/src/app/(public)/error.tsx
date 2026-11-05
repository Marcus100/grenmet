"use client";

// Renders inside the root layout. Errors reach Sentry on the server through
// `onRequestError`; this app ships no client Sentry SDK.
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-10" role="alert">
      <h1 className="text-gm-heading text-heading-lg font-semibold">
        This page could not be loaded
      </h1>
      <p className="text-body text-gm-text-secondary">
        We cannot confirm the current alert status from here. Check GMS
        announcements on radio and TV, then try again.
      </p>
      {error.digest ? (
        <p className="text-caption text-gm-text-muted font-mono">
          Reference: {error.digest}
        </p>
      ) : null}
      <button
        className="bg-gm-blue-ink text-gm-text-inverse rounded-md px-4 py-2 font-medium"
        onClick={() => retry()}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
