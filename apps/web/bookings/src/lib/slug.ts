/** Shape of a business slug: lowercase letters, digits and inner hyphens. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

/**
 * First path segments this app owns. A business can never take one of these
 * as its slug, so the `/[slug]` catch-all cannot shadow or be confused with
 * the staff area, sign-in, the auth hand-off or the API routes.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api",
  "auth",
  "signin",
  "studio",
]);

export function isReservedSlug(value: string): boolean {
  return RESERVED_SLUGS.has(value);
}

export function isBusinessSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && !isReservedSlug(value);
}
