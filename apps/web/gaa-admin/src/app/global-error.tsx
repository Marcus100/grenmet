"use client";

import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <h2>Something went wrong</h2>
        <button onClick={() => retry()} type="button">
          Try again
        </button>
      </body>
    </html>
  );
}
