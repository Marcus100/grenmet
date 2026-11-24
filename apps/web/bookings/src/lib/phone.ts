// Pure phone helpers for the booking detail's Call and WhatsApp buttons.
// Nothing here logs or stores a number.

/** Spaces and the punctuation people type inside numbers. */
const SEPARATORS = /[\s().-]/gu;

const INTERNATIONAL = /^\+(\d{8,15})$/u;
const GRENADA_LOCAL = /^\d{7}$/u;
const GRENADA_WITH_AREA = /^473\d{7}$/u;

/** Grenada's country code (1) and area code (473). */
const GRENADA_PREFIX = "1473";

/**
 * The digits for a `wa.me` address, or null when the number cannot be made
 * international with confidence. A leading `+` is trusted; a 7-digit number
 * is taken as Grenadian; a 10-digit number starting 473 gets the country code
 * 1. Anything else (letters, other lengths) gets no WhatsApp button.
 */
export function whatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const compact = raw.replace(SEPARATORS, "");
  const international = INTERNATIONAL.exec(compact);
  if (international?.[1]) {
    return international[1];
  }
  if (GRENADA_LOCAL.test(compact)) {
    return `${GRENADA_PREFIX}${compact}`;
  }
  if (GRENADA_WITH_AREA.test(compact)) {
    return `1${compact}`;
  }
  return null;
}

/** The `wa.me` address (digits only, no query string), or null. */
export function whatsappHref(raw: string | null | undefined): string | null {
  const digits = whatsappDigits(raw);
  return digits ? `https://wa.me/${digits}` : null;
}

/** A `tel:` address from what was typed (digits and a leading +), or null when nothing dialable is left. */
export function telHref(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/gu, "");
  if (digits.length === 0) {
    return null;
  }
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
