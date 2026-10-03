import type { Admission, EventCategory, Intent, Parish } from "./types";

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  fete: "Fetes",
  music: "Music",
  food: "Food & drink",
  sport: "Sport",
  business: "Business",
  tech: "Tech",
  culture: "Arts & culture",
  faith: "Faith",
  family: "Family",
  wellness: "Wellness",
};

export const PARISH_LABELS: Record<Parish, string> = {
  "st-george": "St. George",
  "st-andrew": "St. Andrew",
  "st-david": "St. David",
  "st-patrick": "St. Patrick",
  "st-mark": "St. Mark",
  "st-john": "St. John",
  carriacou: "Carriacou & Petite Martinique",
};

export const INTENT_LABELS: Record<Intent, string> = {
  "making-friends": "Making friends",
  hiring: "Hiring",
  "looking-for-work": "Open to work",
  collaborating: "Open to collaborate",
  mentoring: "Happy to mentor",
};

export const ADMISSION_LABELS: Record<Admission, string> = {
  free: "Free",
  rsvp: "Free · RSVP",
  ticketed: "Tickets",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as EventCategory[];
export const PARISHES = Object.keys(PARISH_LABELS) as Parish[];

export function isCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && value in CATEGORY_LABELS;
}

export function isParish(value: unknown): value is Parish {
  return typeof value === "string" && value in PARISH_LABELS;
}

const WHITESPACE = /\s+/;

/** "AC" from "Alex Charles". */
export function initials(name: string): string {
  return name
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Public price label. Attendee-facing screens show "EC$" so visitors do not
 * confuse Eastern Caribbean and US dollars.
 */
export function priceLabel(event: {
  readonly admission: Admission;
  readonly priceFrom: {
    readonly amountMinor: number;
    readonly currency: "XCD" | "USD";
  } | null;
}): string {
  if (event.admission !== "ticketed" || !event.priceFrom) {
    return ADMISSION_LABELS[event.admission];
  }
  const symbol = event.priceFrom.currency === "XCD" ? "EC$" : "US$";
  const major = Math.trunc(event.priceFrom.amountMinor / 100);
  return `From ${symbol}${major.toLocaleString("en-US")}`;
}
