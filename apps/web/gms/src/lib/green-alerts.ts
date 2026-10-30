import type { SectorOutlook, SectorOutlookItem } from "@barrelsgd/api-client";
import type { AlertsResult, GreenStatus } from "@/lib/cap-alerts";
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

/**
 * A Green "All clear" bulletin in effect. It is information, not an alert in
 * effect: it is listed as "All clear: <title>" and never counted (owner
 * decision, 30 Oct 2026).
 */
export interface AllClearInformation {
  href: string | null;
  id: string;
  title: string;
  /** "In effect until Fri 30 Oct", or "In effect" when it has no end. */
  when: string;
}

export type GreenAlerts =
  | { status: "unavailable" }
  | {
      status: "ok";
      /** False when a source could not be read, so the lists may be short. */
      complete: boolean;
      items: GreenAlert[];
      /**
       * Non-Green GMS items in effect with no CAP warning yet (Yellow or above
       * not yet published as CAP). Never listed as Green, never ignored.
       */
      other: number;
      /** Green "All clear" bulletins in effect: information, never counted. */
      information: AllClearInformation[];
    };

/** In effect at `now`: started (or no start) and not yet ended (or no end). */
function inEffect(item: SectorOutlookItem, now: Date): boolean {
  const from = item.valid_from ? new Date(item.valid_from) : null;
  const to = item.valid_to ? new Date(item.valid_to) : null;
  return (!from || from <= now) && (!to || to >= now);
}

/**
 * A Green bulletin whose notice type is "All clear". Only Green qualifies: an
 * "All clear" at any other level stays a GMS alert, so a higher level is never
 * hidden.
 */
function isAllClear(item: SectorOutlookItem): boolean {
  return item.colour === "green" && item.notice_type === "All clear";
}

/**
 * The GMS items in effect now, from the same sector outlook that feeds "Plan
 * your week" on the home page. Green items are listed. Yellow and above that
 * are CAP warnings are listed by the warnings feed, so they are not repeated;
 * any other item in effect with no CAP warning is counted as `other`. Green
 * "All clear" bulletins are information and are neither listed as alerts nor
 * counted. A `null` outlook (the feed did not answer) is `unavailable`, never
 * an empty list.
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
  const inForce = outlook.items.filter(
    (item) =>
      inEffect(item, now) &&
      !(item.identifier && warningIds.has(item.identifier))
  );
  const alerts = inForce.filter((item) => !isAllClear(item));
  const items = alerts
    .filter((item) => item.colour === "green")
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
  const other = alerts.filter((item) => item.colour !== "green").length;
  const information = inForce.filter(isAllClear).map((item) => ({
    id: item.identifier ?? item.product_id ?? item.reference,
    title: item.title,
    when: whenLabel(
      item.valid_from ? new Date(item.valid_from) : null,
      item.valid_to ? new Date(item.valid_to) : null,
      now
    ),
    href: hrefFor(item),
  }));
  return {
    status: "ok",
    complete: outlook.complete,
    items,
    other,
    information,
  };
}

/** The masthead's view of the same read: counts only, or unavailable. */
export function greenStatus(green: GreenAlerts): GreenStatus {
  if (green.status === "unavailable") {
    return { status: "unavailable" };
  }
  return {
    status: "ok",
    count: green.items.length,
    other: green.other,
    complete: green.complete,
  };
}
