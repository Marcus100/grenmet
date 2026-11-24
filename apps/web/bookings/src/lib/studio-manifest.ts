import type { MetadataRoute } from "next";

/** Barrels navy (the lane's primary) and the studio's grey ground. */
export const STUDIO_THEME_COLOR = "#15006b";
export const STUDIO_BACKGROUND_COLOR = "#f4f5f8";

/**
 * The studio as an installable app: opens at /studio, full screen, in the
 * Bookings lane colours. No service worker, so install is "add to home screen"
 * and nothing is kept offline.
 */
export function studioManifest(): MetadataRoute.Manifest {
  return {
    name: "Barrels Bookings Studio",
    short_name: "Studio",
    description: "Run your day: agenda, bookings, services and people.",
    id: "/studio",
    start_url: "/studio",
    scope: "/studio",
    display: "standalone",
    theme_color: STUDIO_THEME_COLOR,
    background_color: STUDIO_BACKGROUND_COLOR,
    icons: [
      {
        src: "/studio-icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/studio-icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/studio-icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
