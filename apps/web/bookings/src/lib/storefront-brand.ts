import type { CSSProperties } from "react";
import { pageAccent } from "./brand-colour";

// How a business's brand reaches the public booking page. Plain functions only,
// so the server page and the tests share them.

/** White text on the accent: a passing accent reads white at 4.5:1 or better. */
const ACCENT_TEXT = "#ffffff";

/**
 * Custom properties for the `.booking` wrapper. Set only from a colour that
 * `pageAccent` accepts (`#rrggbb`, 4.5:1 against white); otherwise the page gets
 * no style attribute at all and the shared tokens apply. The values are never
 * joined into a string, so nothing outside the checked hex can be written.
 */
export function brandStyle(
  brandColor: string | null | undefined
): CSSProperties | undefined {
  const accent = pageAccent(brandColor);
  if (!accent) {
    return;
  }
  return {
    "--booking-accent": accent,
    "--booking-accent-text": ACCENT_TEXT,
    "--booking-link": accent,
  } as CSSProperties;
}

/**
 * The image address to show (a logo or a cover photo), or null. Only an https
 * URL is shown; a missing, malformed or other-scheme value (including older
 * cached payloads without the field) shows no image.
 */
export function safeImageUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    // An address with a username or password is never shown.
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** The logo address to show, or null (see `safeImageUrl`). */
export const safeLogoUrl = safeImageUrl;

/** The cover photo address to show, or null (see `safeImageUrl`). */
export const safeCoverUrl = safeImageUrl;
