/**
 * How long a ticket must be out of view before the same value counts as a new
 * scan. Longer than the admitted screen's one second, so the ticket that is
 * still in front of the camera after the green screen does not re-submit.
 */
export const SAME_TICKET_WINDOW_MS = 6000;

export interface ScanGate {
  /**
   * Records that a value was read at `now`, and says whether it should be
   * submitted. Every read refreshes the value's last-seen time, so a ticket
   * held in view stays one scan however long it stays there.
   */
  readonly offer: (value: string, now: number) => boolean;
}

export function createScanGate(windowMs = SAME_TICKET_WINDOW_MS): ScanGate {
  const lastSeen = new Map<string, number>();
  return {
    offer(value, now) {
      // Forget values that have been out of view long enough to count again.
      for (const [seen, at] of lastSeen) {
        if (now - at >= windowMs) {
          lastSeen.delete(seen);
        }
      }
      const repeat = lastSeen.has(value);
      lastSeen.set(value, now);
      return !repeat;
    },
  };
}
