/**
 * The brand colour rule for customer email. One rule in two languages: the same
 * decisions are made in `apps/api/fastapi/src/email_colour.py`, and `colour.test.ts`
 * and `tests/test_email_colour.py` check the same table.
 *
 * An accent is printed only when it is six-digit hex and reaches 4.5:1 against
 * white (the text on the buttons and chips); otherwise the Barrels navy is used.
 */

export const NAVY = "#0b132b";
const MIN_CONTRAST = 4.5;
const HEX = /^#[0-9a-fA-F]{6}$/u;

function channel(hex: string, start: number): number {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

/** Contrast of a six-digit hex colour against white (1 to 21). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** The accent to print: lower-case hex that clears 4.5:1 against white, else navy. */
export function safeAccent(value: string | null | undefined): string {
  if (value && HEX.test(value) && contrastWithWhite(value) >= MIN_CONTRAST) {
    return value.toLowerCase();
  }
  return NAVY;
}
