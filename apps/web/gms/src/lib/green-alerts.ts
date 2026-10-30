import type { SectorOutlook, SectorOutlookItem } from "@barrelsgd/api-client";
import type { AlertsResult } from "@/lib/cap-alerts";
import { firstSentence, hrefFor, whenLabel } from "@/lib/sector-outlook";

/** A Green (calm) GMS alert in effect, as the alerts page lists it. */
export interface GreenAlert {
  href: string | null;
  id: string;
  summary: string;
  title: string;
  /** "In effect until Fri 30 Oct", or "In effect" when it has no end. */
  when: string;
}

export type GreenAlerts =
  | { status: "unavailable" }
  | { status: "ok"; complete: boolean; items: GreenAlert[] };

/** In effect at `now`: started (or no start) and not yet ended (or no end). */
function inEffect(item: SectorOutlookItem, now: Date): boolean {
  const from = item.valid_from ? new Date(item.valid_from) : null;
  const to = item.valid_to ? new Date(item.valid_to) : null;
  return (!from || from <= now) && (!to || to >= now);
}

/**
 * The Green alerts in effect now, from the same sector outlook that feeds
 * "Plan your week" on the home page. Yellow and above are CAP warnings and
 * are listed by the warnings feed, so they are not repeated here. A Green
 * item that is also a CAP warning shown above is dropped. `null` outlook
 * (the feed did not answer) is `unavailable`, never an empty list.
 */
export function greenAlerts(
  outlook: SectorOutlook | null,
  cap: AlertsResult,
  now: Date
): GreenAlerts {
  if (!outlook) {
    return { status: "unavailable" };
  }
  const warningIds = new Set(
    cap.status === "ok"
      ? cap.groups.flatMap((group) => group.alerts.map((a) => a.identifier))
      : []
  );
  const items = outlook.items
    .filter(
      (item) =>
        item.colour === "green" &&
        inEffect(item, now) &&
        !(item.identifier && warningIds.has(item.identifier))
    )
    .map((item) => ({
      id: item.identifier ?? item.product_id ?? item.reference,
      title: item.title,
      summary: firstSentence(item.impacts),
      when: whenLabel(
        item.valid_from ? new Date(item.valid_from) : null,
        item.valid_to ? new Date(item.valid_to) : null,
        now
      ),
      href: hrefFor(item),
    }));
  return { status: "ok", complete: outlook.complete, items };
}
