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
    <div className="mx-auto max-w-xl space-y-3 px-4 py-10" role="alert">
      <h1 className="font-bold font-gm-display text-gm-display text-gm-navy uppercase tracking-wide">
        This page could not be loaded
      </h1>
      <p className="text-body-base text-gm-text-secondary leading-body-base">
        Something went wrong on our side. Try again in a moment.
      </p>
      {error.digest ? (
        <p className="font-mono text-body-sm text-gm-text-muted leading-body-sm">
          Reference: {error.digest}
        </p>
      ) : null}
      <Button onClick={() => retry()} type="button">
        Try again
      </Button>
    </div>
  );
}
