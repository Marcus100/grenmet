"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui";

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] p-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
          <WifiOff className="h-10 w-10 text-[var(--color-primary)]" />
        </div>

        <h1 className="mb-3 font-bold text-2xl text-[var(--color-text-primary)]">
          You&apos;re Offline
        </h1>

        <p className="mb-8 text-[var(--color-text-secondary)]">
          It looks like you&apos;ve lost your internet connection. Please check
          your network and try again.
        </p>

        <Button onClick={handleRetry} size="lg" variant="primary">
          Try Again
        </Button>
      </div>
    </div>
  );
}
