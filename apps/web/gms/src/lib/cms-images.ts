// Safe in Server and Client Components; cms.ts itself is server-only.

/**
 * Media files on the production and staging CMS. Keep in step with
 * `images.remotePatterns` in next.config.ts.
 */
const CMS_MEDIA =
  /^https:\/\/cms\.(?:staging\.)?barrels\.gd\/api\/media\/file\//u;

/**
 * Next resizes and caches images only from hosts listed in next.config. CMS
 * media goes through it so a thumbnail downloads at its shown size, not the
 * uploaded original (issue #1233). Anything else, such as a local CMS in
 * development, loads directly.
 */
export const isOptimizableImage = (src: string) =>
  src.startsWith("/") ||
  src.startsWith("https://images.unsplash.com/") ||
  CMS_MEDIA.test(src);
