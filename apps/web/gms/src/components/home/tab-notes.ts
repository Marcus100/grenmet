/**
 * Weather now tab notes. Kept out of the client panel file: a value exported
 * from a "use client" module reaches server components as a reference, not as
 * the real value, so the list below could not be looped over there.
 */

import type { RelatedLink } from "@/lib/cms";

/** The imagery tabs, each of which can carry a forecaster's note. */
export const NOTE_KINDS = ["satellite", "radar", "wind", "seas"] as const;

/** A forecaster's note for one imagery tab, already formatted on the server. */
export interface TabNote {
  link: RelatedLink | null;
  posted: string | null;
  text: string;
  title: string;
}
export type TabNotes = Partial<Record<(typeof NOTE_KINDS)[number], TabNote>>;
