/** Shape of a business slug: lowercase letters, digits and inner hyphens. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function isBusinessSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
