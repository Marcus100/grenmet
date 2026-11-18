import type { PrintixEventSummary } from "@barrelsgd/api-client";
import { useCallback } from "react";
import type { Problem } from "@/organiser/errors";
import { readEventSummary } from "@/organiser/organiser-api";
import type { OrganiserSession } from "@/organiser/session";
import { REFRESH_MS, usePolledRead } from "@/organiser/use-polled-read";

/**
 * How often an open event page reads its counts: 6 a minute, well inside the
 * server's limit for this read. Paused while the tab is hidden.
 */
export const SUMMARY_REFRESH_MS = REFRESH_MS;

export interface SummaryView {
  /** Why the latest read failed; null after a good read. */
  readonly problem: Problem | null;
  /** Reads the counts now (after a change such as a void or a close). */
  readonly reload: () => void;
  /** The last counts the server confirmed, kept on screen after a failed read. */
  readonly summary: PrintixEventSummary | null;
  readonly updatedAt: Date | null;
}

/** Reads an event's live counts now, then every 10 seconds while the page is visible. */
export function useEventSummary(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): SummaryView {
  const load = useCallback(
    () => readEventSummary(session, organisationId, eventId),
    [session, organisationId, eventId]
  );
  const { value, problem, updatedAt, reload } = usePolledRead(load);
  return { summary: value, problem, updatedAt, reload };
}
