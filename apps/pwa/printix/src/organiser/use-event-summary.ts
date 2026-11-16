import type { PrintixEventSummary } from "@barrelsgd/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Problem } from "@/organiser/errors";
import { readEventSummary } from "@/organiser/organiser-api";
import type { OrganiserSession } from "@/organiser/session";

/**
 * How often an open event page reads its counts: 6 a minute, well inside the
 * server's limit for this read. Paused while the tab is hidden.
 */
export const SUMMARY_REFRESH_MS = 10_000;

export interface SummaryView {
  /** Why the latest read failed; null after a good read. */
  readonly problem: Problem | null;
  /** Reads the counts now (after a change such as a void or a close). */
  readonly reload: () => void;
  /** The last counts the server confirmed, kept on screen after a failed read. */
  readonly summary: PrintixEventSummary | null;
  readonly updatedAt: Date | null;
}

const isVisible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

/**
 * Reads an event's live counts now, then every 10 seconds while the page is
 * visible. A failed read keeps the last good counts and says why. A rate limit
 * sets a `notBefore` time from Retry-After, which both the timer and the
 * visibility handler respect, so flipping tabs cannot exceed the limit. Reads
 * never overlap.
 */
export function useEventSummary(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): SummaryView {
  const [view, setView] = useState<Omit<SummaryView, "reload">>({
    summary: null,
    problem: null,
    updatedAt: null,
  });
  const reloadRef = useRef<() => void>(() => undefined);
  // Stable: callers may list it in an effect's dependencies without a loop.
  const reload = useCallback(() => reloadRef.current(), []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let notBefore = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isVisible()) {
          read();
        }
      }, delayMs);
    };

    const read = () => {
      if (inFlight || !active) {
        return;
      }
      const wait = notBefore - Date.now();
      if (wait > 0) {
        // The server asked for a pause: keep to it, whatever woke us.
        schedule(wait);
        return;
      }
      inFlight = true;
      clearTimeout(timer);
      readEventSummary(session, organisationId, eventId).then((outcome) => {
        inFlight = false;
        if (!active) {
          return;
        }
        if (outcome.ok) {
          setView({
            summary: outcome.value,
            problem: null,
            updatedAt: new Date(),
          });
          schedule(SUMMARY_REFRESH_MS);
          return;
        }
        setView((current) => ({ ...current, problem: outcome.problem }));
        if (outcome.problem.kind === "session-ended") {
          return;
        }
        if (outcome.problem.kind === "rate-limited") {
          notBefore = Date.now() + outcome.problem.retryAfterSeconds * 1000;
          schedule(outcome.problem.retryAfterSeconds * 1000);
          return;
        }
        schedule(SUMMARY_REFRESH_MS);
      });
    };

    const onVisibilityChange = () => {
      if (isVisible()) {
        read();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    reloadRef.current = read;
    read();
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [session, organisationId, eventId]);

  return { ...view, reload };
}
