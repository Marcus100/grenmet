import type { MetadataRoute } from "next";

// Written once at build time (static export).
export const dynamic = "force-static";

/**
 * The web app manifest: what makes "Add to Home Screen" install the scanner as
 * an app with its own icon and no browser bar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Printix Scanner",
    short_name: "Printix",
    description: "Scan Printix event tickets at the gate.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d0c",
    theme_color: "#0b0d0c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
