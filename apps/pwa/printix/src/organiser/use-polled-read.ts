import { useCallback, useEffect, useRef, useState } from "react";
import type { Outcome, Problem } from "@/organiser/errors";

/**
 * How often an open event page reads its live numbers: 6 a minute for each
 * read, well inside the server's limit. Paused while the tab is hidden.
 */
export const REFRESH_MS = 10_000;

export interface PolledView<T> {
  /** Why the latest read failed; null after a good read. */
  readonly problem: Problem | null;
  /** Reads now (after a change such as a void or a close). */
  readonly reload: () => void;
  readonly updatedAt: Date | null;
  /** The last answer the server confirmed, kept on screen after a failed read. */
  readonly value: T | null;
}

const isVisible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

/**
 * Runs `load` now, then every 10 seconds while the page is visible. A failed
 * read keeps the last good value and says why. A rate limit sets a `notBefore`
 * time from Retry-After, which both the timer and the visibility handler
 * respect, so flipping tabs cannot exceed the limit. Reads never overlap.
 * `load` must be stable (wrap it in useCallback): a new one restarts the poll.
 */
export function usePolledRead<T>(
  load: () => Promise<Outcome<T>>
): PolledView<T> {
  const [view, setView] = useState<Omit<PolledView<T>, "reload">>({
    value: null,
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
      load().then((outcome) => {
        inFlight = false;
        if (!active) {
          return;
        }
        if (outcome.ok) {
          setView({
            value: outcome.value,
            problem: null,
            updatedAt: new Date(),
          });
          schedule(REFRESH_MS);
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
        schedule(REFRESH_MS);
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
  }, [load]);

  return { ...view, reload };
}
