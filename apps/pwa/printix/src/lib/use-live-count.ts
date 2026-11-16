import type { PrintixEventSummary } from "@barrelsgd/api-client";
import { useEffect, useRef, useState } from "react";
import {
  type Connection,
  type PairingProblem,
  readSummary,
} from "@/lib/scan-api";

/** Summary reads are capped at 30 a minute per pairing; five seconds is 12. */
export const COUNT_POLL_MS = 5000;

export type Link = "ok" | "no-signal" | "failed";

export interface LiveCount {
  /** Whether the last read reached the server; failures are shown quietly. */
  readonly link: Link;
  /** Reads now, for example after an admission. */
  readonly refresh: () => void;
  readonly summary: PrintixEventSummary | null;
}

/**
 * The event's live counts, polled while the screen is open. A failed read keeps
 * the last good numbers on screen. A pairing problem stops the polling and is
 * reported once, so the screen can explain it.
 */
export function useLiveCount(
  connection: Connection | null,
  onPairingProblem: (problem: PairingProblem) => void
): LiveCount {
  const [summary, setSummary] = useState<PrintixEventSummary | null>(null);
  const [link, setLink] = useState<Link>("ok");
  const refreshRef = useRef<() => void>(() => undefined);
  const problemRef = useRef(onPairingProblem);

  useEffect(() => {
    problemRef.current = onPairingProblem;
  }, [onPairingProblem]);

  useEffect(() => {
    if (!connection) {
      return;
    }
    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      const answer = await readSummary(connection);
      inFlight = false;
      if (!active) {
        return;
      }
      let delay = COUNT_POLL_MS;
      if (answer.kind === "summary") {
        setSummary(answer.summary);
        setLink("ok");
      } else if (answer.kind === "pairing") {
        problemRef.current(answer.problem);
        return;
      } else if (answer.kind === "rate-limited") {
        delay = answer.retryAfterSeconds * 1000;
      } else {
        setLink(answer.kind === "no-signal" ? "no-signal" : "failed");
      }
      timer = setTimeout(tick, delay);
    };

    refreshRef.current = () => {
      clearTimeout(timer);
      tick().catch(() => undefined);
    };
    tick().catch(() => undefined);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [connection]);

  return {
    summary,
    link,
    refresh: () => refreshRef.current(),
  };
}
