// Pure phone helpers for the booking detail's Call and WhatsApp buttons.
// Nothing here logs or stores a number.

/** Spaces and the punctuation people type inside numbers. */
const SEPARATORS = /[\s().-]/gu;

const INTERNATIONAL = /^\+([1-9]\d{7,14})$/u;
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

/** The number at the start of the text: digits, an optional leading +, and the usual separators. */
const LEADING_NUMBER = /^\s*(\+?[\d\s().-]*\d)/u;

/**
 * A `tel:` address from the number at the start of what was typed (digits and
 * a leading +), or null when there is none. Text after the number, such as an
 * extension, is dropped rather than joined onto it.
 */
export function telHref(raw: string | null | undefined): string | null {
  const lead = raw ? LEADING_NUMBER.exec(raw)?.[1] : undefined;
  if (!lead) {
    return null;
  }
  const digits = lead.replace(/\D/gu, "");
  return `tel:${lead.startsWith("+") ? "+" : ""}${digits}`;
}
