import { PreferencesStoreProvider } from "@barrelsgd/theme/components/preferences-provider";
import { ThemeBootScript } from "@barrelsgd/theme/components/theme-boot";
import { PREFERENCE_DEFAULTS } from "@barrelsgd/theme/lib/preferences-config";
import type { Metadata, Viewport } from "next";

// The studio is light only (its surfaces have no dark values) and keeps the top
// bar in view on a phone, where New booking lives. Only these studio routes
// carry the display preferences; the public booking pages never do.
const STUDIO_DEFAULTS = {
  navbar_style: "sticky",
  theme_mode: "light",
} as const;

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
 * screens use the admin-kit shell in `[orgSlug]/layout.tsx`, the picker its
 * plain frame.
 * Pages own the sign-in redirect (they know the full path), so a deep link
 * survives an expired session.
 */
export default function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <ThemeBootScript defaults={STUDIO_DEFAULTS} />
      <PreferencesStoreProvider
        contentLayout={PREFERENCE_DEFAULTS.content_layout}
        font={PREFERENCE_DEFAULTS.font}
        navbarStyle={STUDIO_DEFAULTS.navbar_style}
        themeMode={STUDIO_DEFAULTS.theme_mode}
        themePreset={PREFERENCE_DEFAULTS.theme_preset}
      >
        {children}
      </PreferencesStoreProvider>
    </>
  );
}
