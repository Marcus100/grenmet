import { APIError } from "payload";

/** Words that belong to issued warnings, never to editorial copy alone. */
const HAZARD_WORDS = /\b(warnings?|watch(?:es)?|advisory|advisories)\b/i;

/**
 * Warnings are issued only through the warning system. Editorial text that
 * uses warning language must link to the CAP alert it refers to.
 */
export function assertNoUnlinkedHazard(
  texts: (string | null | undefined)[],
  hasAlertLink: boolean
) {
  if (hasAlertLink) return;
  const word = texts
    .map((text) => text?.match(HAZARD_WORDS)?.[0])
    .find(Boolean);
  if (word)
    throw new APIError(
      `"${word}" reads like an official warning. Warnings are issued in the warning system; add a link to the CAP alert, or reword.`,
      400
    );
}

export const isCapLink = (link: {
  category?: string | null;
  url?: string | null;
}) => link.category === "cap" && Boolean(link.url);
