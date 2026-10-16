// Safe in Server and Client Components; cms.ts itself is server-only.
/**
 * Next only optimises images from hosts listed in next.config. CMS media
 * comes from each environment's own CMS address, so it loads directly.
 */
export const isOptimizableImage = (src: string) =>
  src.startsWith("/") || src.startsWith("https://images.unsplash.com/");
