"use client";

import { useEffect, useState } from "react";

/**
 * Shows a warning when this page was rendered long ago. The edge cache may
 * keep serving the last good HTML while the origin is down, and that HTML
 * cannot know how old it has become; the visitor's own clock can.
 */
export function StaleGuard({
  renderedAt,
  staleAfterMinutes,
  clock,
}: {
  /** ISO time of the last successful read of the alert feed. */
  renderedAt: string;
  staleAfterMinutes: number;
  /** HH:MM of the same moment, formatted in Grenada time on the server. */
  clock: string;
}) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const check = () =>
      setStale(
        Date.now() - Date.parse(renderedAt) >= staleAfterMinutes * 60_000
      );
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [renderedAt, staleAfterMinutes]);

  if (!stale) {
    return null;
  }
  return (
    <p
      className="rounded-gm-card border-gm-warning-amber-border bg-gm-warning-amber-bg text-body-sm text-gm-warning-amber-fg border p-3"
      role="status"
    >
      <strong>This page may be out of date.</strong> It was last updated at{" "}
      {clock} (Grenada time). Reload to check for newer information, and follow
      GMS announcements on radio and TV.
    </p>
  );
}
