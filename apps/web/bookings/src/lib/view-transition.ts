import type { CSSProperties } from "react";
import { SLUG_PATTERN } from "@/lib/slug";

// The name that glides from a home page card to the business page's heading
// (cross-document view transition). The name comes from the business slug, so
// it is emitted only when the slug has the safe shape (lowercase letters,
// digits and inner hyphens, which is also a valid CSS identifier piece);
// anything else gets no name and simply cross-fades.

/**
 * Inline custom property read by `.vt-biz` in `globals.css` (that rule sits
 * inside the no-preference motion block, so reduced motion gets no name).
 */
export function businessTransitionStyle(
  slug: string
): CSSProperties | undefined {
  return SLUG_PATTERN.test(slug)
    ? ({ "--vt": `biz-${slug}` } as CSSProperties)
    : undefined;
}
