import type { EventDetail } from "@/domain/types";
import { reportError } from "@/lib/report-error";

/**
 * Reads each event behind a list of tickets once. A failed read is reported and
 * counts as no event, so one flaky lookup never takes the whole list down; that
 * ticket simply shows no refund terms.
 */
export async function readTicketEvents(
  slugs: readonly string[],
  read: (slug: string) => Promise<EventDetail | null>
): Promise<Map<string, EventDetail>> {
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return [slug, await read(slug)] as const;
      } catch (error) {
        reportError(error, "my-tickets-terms");
        return [slug, null] as const;
      }
    })
  );
  return new Map(
    entries.flatMap(([slug, event]) => (event ? [[slug, event] as const] : []))
  );
}
