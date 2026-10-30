import type { Metadata } from "next";
import { env } from "@/lib/env";
import { SITE_NAME } from "@/lib/site-name";

export const SITE_DESCRIPTION =
  "Official weather forecasts, alerts, and bulletins for Grenada, Carriacou & Petite Martinique.";

/**
 * Site-wide metadata for the root layout. Pages set their own `title`; the
 * template adds the site name. Pages that set no `openGraph` share the site
 * name and description when a link is shared.
 */
export const SITE_METADATA: Metadata = {
  // Absolute base for share-preview links; set per environment at build time.
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  // Every route's own `title` fills the template: "<Page> | Grenada Meteorological Service".
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // "./" resolves against each page's own path, so every page names itself.
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};
