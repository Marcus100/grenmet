"use client";

/** Desk pages that failed to render. Errors reach Sentry on the server. */
export default function DeskError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="space-y-3 py-10" role="alert">
      <h1 className="font-semibold text-2xl">This desk page failed</h1>
      <p className="text-muted-foreground">
        Reload it. If a warning must go out now, use the CAP desk in GAA Admin.
      </p>
      {error.digest ? (
        <p className="font-mono text-caption">Reference: {error.digest}</p>
      ) : null}
      <button
        className="rounded-md border px-3 py-1.5"
        onClick={() => retry()}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
