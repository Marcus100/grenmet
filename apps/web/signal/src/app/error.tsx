"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

// Renders inside the root layout, so site navigation stays usable.
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    captureException(error, { tags: { digest: error.digest } });
  }, [error]);

  return (
    <div className="mx-auto max-w-xl space-y-3 p-6" role="alert">
      <h1 className="font-semibold text-2xl">This page could not be loaded</h1>
      <p className="text-muted-foreground text-sm">
        Something went wrong on our side. Try again in a moment.
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
