import { BARRELS_SUPPORT_EMAIL } from "@barrelsgd/ui/lib/support";

/**
 * `mailto:` link that reports a business listing to Barrels support. The
 * subject carries the business slug only: no visitor, contact or booking data.
 */
export function reportListingHref(slug: string): string {
  const subject = encodeURIComponent(`Report listing: ${slug}`);
  return `mailto:${BARRELS_SUPPORT_EMAIL}?subject=${subject}`;
}
