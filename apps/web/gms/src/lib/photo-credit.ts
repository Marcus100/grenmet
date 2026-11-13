/**
 * The credit line under every picture on the site (owner, 5 Nov 2026). A CMS
 * picture without a credit says GMS took it, so the line always renders.
 */
export const DEFAULT_PHOTO_CREDIT = "Photo: GMS";

/** The credit a CMS picture carries, or "Photo: GMS" when it has none. */
export function photoCredit(credit: string | null | undefined): string {
  const trimmed = credit?.trim();
  return trimmed ? trimmed : DEFAULT_PHOTO_CREDIT;
}
