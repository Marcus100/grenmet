"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import { absoluteBookingUrl } from "@/lib/booking-url";
import { reportError } from "@/lib/report-error";

type CopyState = "idle" | "copied" | "failed";

const MESSAGE: Record<CopyState, string> = {
  idle: "",
  copied: "Link copied.",
  failed: "Copying did not work here. Select the address above and copy it.",
};

/**
 * Copies the full public booking address. `origin` comes from configuration
 * (the deploy's own address); without it the address is this page's origin.
 */
export function CopyLinkButton({
  origin,
  path,
}: Readonly<{ origin?: string; path: string }>) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    const url = absoluteBookingUrl(path, origin ?? window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch (error) {
      // Clipboard access can be refused by the browser; show the next step.
      reportError(error, "studio");
      setState("failed");
    }
  }

  return (
    <>
      <Button
        className="min-h-11"
        onClick={copy}
        type="button"
        variant="outline"
      >
        Copy link
      </Button>
      <p
        aria-live="polite"
        className="text-muted-foreground text-sm"
        role="status"
      >
        {MESSAGE[state]}
      </p>
    </>
  );
}
