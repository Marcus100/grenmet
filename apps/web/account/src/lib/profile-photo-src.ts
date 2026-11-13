/** Sizes the page asks for: the avatar is shown at 256 px. */
const AVATAR_SIZE = 256;

/**
 * Same-origin URL of a photo, served through this app's API proxy. The
 * `v` parameter changes with every upload, so a replaced photo is never
 * shown from the browser cache. Loaded with a plain <img>, never next/image.
 * Client-safe: no server imports here.
 */
export function profilePhotoSrc(version: string): string {
  const params = new URLSearchParams({
    size: String(AVATAR_SIZE),
    v: version,
  });
  // Your own photo: this app's sessions may not read anyone else's (ADR-0057).
  return `/api/v1/profile-images/me/image?${params.toString()}`;
}
