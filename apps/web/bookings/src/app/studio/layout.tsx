import type { Metadata, Viewport } from "next";

// Per-person pages: never prerendered or cached.
export const dynamic = "force-dynamic";

// Staff area for business owners and staff: never indexed. The manifest makes
// the studio installable on a phone (`/studio-manifest.webmanifest`).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/studio-manifest.webmanifest",
  applicationName: "Barrels Bookings Studio",
  appleWebApp: { capable: true, title: "Studio", statusBarStyle: "default" },
  icons: {
    apple: [
      {
        url: "/studio-icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = { themeColor: "#15006b" };

/**
 * The frame (navigation, header, `main`) belongs to each area: the business
 * screens use the shell in `[orgSlug]/layout.tsx`, the picker its plain frame.
 * Pages own the sign-in redirect (they know the full path), so a deep link
 * survives an expired session.
 */
export default function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
