// The business accent colour rule, as the emails apply it. The same decisions
// are made in `apps/api/fastapi/src/email_colour.py` and
// `packages/email-templates/src/components/colour.ts`; `brand-colour.test.ts`
// checks the same table as those tests (issue #1622). Keep the three in step.
//
// A colour is usable when it is six-digit hex and reaches 4.5:1 against white
// (the text on buttons). Otherwise mail prints the Barrels navy.

export const NAVY = "#0b132b";
export const MIN_CONTRAST = 4.5;
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

/**
 * The accent a page may use: lower-case hex that passes, else null (the page
 * keeps the shared tokens). Anything that is not `#rrggbb` is refused, so a raw
 * string never reaches a style attribute.
 */
export function pageAccent(value: string | null | undefined): string | null {
  if (value && HEX.test(value) && contrastWithWhite(value) >= MIN_CONTRAST) {
    return value.toLowerCase();
  }
  return null;
}

/** The accent the emails print: lower-case hex that passes, else navy. */
export function safeAccent(value: string | null | undefined): string {
  return pageAccent(value) ?? NAVY;
}

/**
 * What the settings field tells the person about what they typed. `text` is the
 * raw input, so a space or a missing `#` is "invalid", not "empty".
 */
export type BrandColourCheck =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "pass"; hex: string; ratio: number }
  | { kind: "fallback"; hex: string; ratio: number };

export function checkBrandColour(text: string): BrandColourCheck {
  if (text === "") {
    return { kind: "empty" };
  }
  if (!HEX.test(text)) {
    return { kind: "invalid" };
  }
  const hex = text.toLowerCase();
  const exact = contrastWithWhite(hex);
  // Rounded down, so a colour that fails (4.48) never reads as the 4.5 it needs.
  const ratio = Math.floor(exact * 10) / 10;
  return exact >= MIN_CONTRAST
    ? { kind: "pass", hex, ratio }
    : { kind: "fallback", hex, ratio };
}
