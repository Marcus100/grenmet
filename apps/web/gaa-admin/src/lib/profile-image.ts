/** Square sizes the API stores for each profile photo (#1303). */
export type ProfileImageSize = 64 | 256 | 512;

/**
 * Same-origin link to a person's profile photo, through the `/api` proxy.
 *
 * The API answers a redirect to a short-lived storage link, or 404 when there
 * is no photo or the viewer may not see it; the avatar then shows initials.
 * Load it with a plain image (never next/image optimisation): it needs the
 * viewer's session.
 */
export function profileImageUrl(
  userId: string,
  size: ProfileImageSize = 64
): string {
  return `/api/v1/profile-images/org/${encodeURIComponent(userId)}?size=${size}`;
}
