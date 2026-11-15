// The business's own contact options (set in Studio settings) as links. The
// API stores them normalised (E.164 phone, WhatsApp digits, Instagram handle
// without @), so this only builds addresses; it never guesses at raw input.

import type { BookingBusinessContact } from "@barrelsgd/api-client";

export type ContactKind = "phone" | "whatsapp" | "instagram" | "email";

export interface ContactLink {
  /** Opens another site (WhatsApp, Instagram): shown in a new tab with a hint. */
  external: boolean;
  href: string;
  kind: ContactKind;
  /** Visible text, e.g. "Call +14734401234". */
  label: string;
}

/** Order the links appear in: the quickest ways to reach someone first. */
const ORDER: ContactKind[] = ["phone", "whatsapp", "instagram", "email"];

const DIGITS = /^\d{7,15}$/u;
const E164 = /^\+\d{7,15}$/u;
const HANDLE = /^[A-Za-z0-9._]{1,30}$/u;

function link(kind: ContactKind, value: string): ContactLink | null {
  switch (kind) {
    case "phone":
      return E164.test(value)
        ? {
            kind,
            href: `tel:${value}`,
            label: `Call ${value}`,
            external: false,
          }
        : null;
    case "whatsapp":
      return DIGITS.test(value)
        ? {
            kind,
            href: `https://wa.me/${value}`,
            label: "WhatsApp",
            external: true,
          }
        : null;
    case "instagram":
      return HANDLE.test(value)
        ? {
            kind,
            href: `https://instagram.com/${value}`,
            label: `Instagram @${value}`,
            external: true,
          }
        : null;
    case "email":
      return value.includes("@")
        ? {
            kind,
            // Encoded so a "?" or "%" cannot add headers (cc, body); "@" stays readable.
            href: `mailto:${encodeURIComponent(value).replace("%40", "@")}`,
            label: `Email ${value}`,
            external: false,
          }
        : null;
    default:
      return null;
  }
}

/** The options the business filled in, as links; empty when none are set. */
export function contactLinks(
  contact: BookingBusinessContact | null | undefined
): ContactLink[] {
  if (!contact) {
    return [];
  }
  const links: ContactLink[] = [];
  for (const kind of ORDER) {
    const value = contact[kind]?.trim();
    const built = value ? link(kind, value) : null;
    if (built) {
      links.push(built);
    }
  }
  return links;
}

/**
 * How a sentence that sends people to the business ends: a colon before the
 * links, or "directly." when the business has set none.
 */
export function contactEnding(
  contact: BookingBusinessContact | null | undefined
): string {
  return contactLinks(contact).length > 0 ? ":" : " directly.";
}
