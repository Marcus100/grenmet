"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Pause, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_INTERVAL_MS = 60_000;
const TICK_MS = 1000;

function ago(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  return `${Math.floor(seconds / 60)}m ago`;
}

/**
 * Keeps the server-rendered panels current by re-running the route's data
 * fetches on an interval. Refreshes are skipped while the tab is hidden (a
 * background tab does not need fresh imagery) and while paused.
 */
export function LiveRefresh({
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  // Set on mount, not in the initial state: the server has no clock the client
  // can agree with, and a mismatch would fail hydration.
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
    setRefreshedAt(Date.now());
    setNow(Date.now());
  }, [router]);

  useEffect(() => {
    setRefreshedAt(Date.now());
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (paused) {
      return;
    }
    const id = setInterval(() => {
      if (document.hidden) {
        return;
      }
      refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, paused, refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const label =
    refreshedAt === null || now === null
      ? "Live"
      : `Updated ${ago(now - refreshedAt)}`;

  return (
    <div className="flex items-center gap-2">
      <span
        aria-live="polite"
        className="text-muted-foreground text-xs tabular-nums"
      >
        {label}
      </span>
      <Button
        aria-label={paused ? "Resume auto-refresh" : "Pause auto-refresh"}
        onClick={() => setPaused((value) => !value)}
        size="icon-sm"
        variant="ghost"
      >
        {paused ? <Play /> : <Pause />}
      </Button>
      <Button
        aria-label="Refresh now"
        onClick={refresh}
        size="icon-sm"
        variant="ghost"
      >
        <RefreshCw />
      </Button>
    </div>
  );
}
