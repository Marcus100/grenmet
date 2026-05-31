"use client";

import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <h2>Something went wrong</h2>
        <button onClick={reset} type="button">
          Try again
        </button>
      </body>
    </html>
  );
}
