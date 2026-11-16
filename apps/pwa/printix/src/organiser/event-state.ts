import type { PrintixEventPublic } from "@barrelsgd/api-client";

/**
 * Closed for this screen: the organiser closed it, or its closing time has passed.
 * Nothing about a closed event can change, so setup actions are not offered.
 */
export function isEventClosed(
  event: Pick<PrintixEventPublic, "status" | "closes_at">,
  now: Date
): boolean {
  return (
    event.status === "closed" ||
    new Date(event.closes_at).getTime() <= now.getTime()
  );
}
