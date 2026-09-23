"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

// Route-segment boundary for every admin page. It renders inside the admin
// layout, so navigation stays usable while one page is failing.
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Server Component errors reach the client with a generic message; the
    // digest links this report to the server-side log entry.
    captureException(error, { tags: { digest: error.digest } });
  }, [error]);

  return (
    <div className="space-y-3 p-6" role="alert">
      <h1 className="font-semibold text-2xl">This page could not be loaded</h1>
      <p className="text-muted-foreground text-sm">
        A service it depends on may be temporarily unavailable. Try again, or
        use the menu to continue elsewhere.
      </p>
      {error.digest ? (
        <p className="font-mono text-muted-foreground text-xs">
          Reference: {error.digest}
        </p>
      ) : null}
      <Button onClick={() => retry()} type="button">
        Try again
      </Button>
    </div>
  );
}
